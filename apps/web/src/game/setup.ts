import { BOT_DIFFICULTIES, BOT_PERSONALITIES } from '@meow/engine';
import { CLASSIC_MODE, type GameMode } from '@meow/protocol';
import { botCats } from './cats';
import { type BotSeat, CAT_COLORS, type CatColor, NAME_MAX_LENGTH, type SeatInfo } from './types';

export { BOT_CAT } from './cats';

/** A bot in a setup: its cat is drawn when it is added and shown in the waiting room. */
export interface SetupBot extends BotSeat {
  /** Missing in setups saved before DECISIONS 052 (then it gets its classic cat). */
  readonly cat?: CatColor | undefined;
}

export interface SoloSetup {
  readonly name: string;
  readonly cat: CatColor;
  readonly bots: readonly SetupBot[];
  /** Classic / cat powers / market events (GAME_RULES §12). */
  readonly mode: GameMode;
}

/** A stored mode, or classic if it is missing or malformed (older saves had none). */
function readMode(value: unknown): GameMode {
  const m = value as Partial<GameMode> | undefined;
  return typeof m?.powers === 'boolean' && typeof m.events === 'boolean'
    ? { powers: m.powers, events: m.events }
    : CLASSIC_MODE;
}

const SETUP_KEY = 'mnm.setup.v1';

export const DEFAULT_SETUP: SoloSetup = {
  name: '',
  cat: 'calico',
  bots: [
    { personality: 'greedy', difficulty: 'normal' },
    { personality: 'careful', difficulty: 'normal' },
  ],
  mode: CLASSIC_MODE,
};

export function loadSetup(): SoloSetup {
  try {
    const raw = localStorage.getItem(SETUP_KEY);
    if (!raw) return DEFAULT_SETUP;
    const data = JSON.parse(raw) as SoloSetup;
    if (!Array.isArray(data.bots)) return DEFAULT_SETUP;
    const bots = data.bots as readonly Partial<SetupBot>[];
    const valid =
      typeof data.name === 'string' &&
      (CAT_COLORS as readonly string[]).includes(data.cat) &&
      bots.length >= 1 &&
      bots.length <= 3 &&
      bots.every(
        (b) =>
          (BOT_PERSONALITIES as readonly unknown[]).includes(b.personality) &&
          (BOT_DIFFICULTIES as readonly unknown[]).includes(b.difficulty) &&
          (b.cat === undefined || (CAT_COLORS as readonly unknown[]).includes(b.cat)),
      );
    return valid
      ? { ...data, name: data.name.slice(0, NAME_MAX_LENGTH), mode: readMode(data.mode) }
      : DEFAULT_SETUP;
  } catch {
    return DEFAULT_SETUP;
  }
}

export function storeSetup(setup: SoloSetup): void {
  try {
    localStorage.setItem(SETUP_KEY, JSON.stringify(setup));
  } catch {
    // ignore
  }
}

/** Bots keep their own cat when it is still free; others get one (every seat its own cat). */
function resolveBotCats(taken: readonly CatColor[], bots: readonly SetupBot[]): CatColor[] {
  const used = new Set(taken);
  const kept = bots.map((b) => {
    if (!b.cat || used.has(b.cat)) return null;
    used.add(b.cat);
    return b.cat;
  });
  return kept.map((cat, i) => {
    if (cat) return cat;
    const [fresh] = botCats([...used], [bots[i]!]);
    used.add(fresh!);
    return fresh!;
  });
}

const pick = <T>(items: readonly T[], random: () => number): T =>
  items[Math.floor(random() * items.length)]!;

/** A random cat nobody in `taken` has. */
export function randomFreeCat(taken: readonly CatColor[], random: () => number): CatColor {
  const free = CAT_COLORS.filter((c) => !taken.includes(c));
  return free.length > 0 ? pick(free, random) : CAT_COLORS[0];
}

/** Add a bot: only the difficulty is chosen — personality and cat are drawn. */
export function newBot(
  difficulty: BotSeat['difficulty'],
  taken: readonly CatColor[],
  random: () => number = Math.random,
): SetupBot {
  return {
    personality: pick(BOT_PERSONALITIES, random),
    difficulty,
    cat: randomFreeCat(taken, random),
  };
}

/** Solo: I take this cat; a bot holding it draws another free one (people first). */
export function soloTakeCat(
  setup: SoloSetup,
  cat: CatColor,
  random: () => number = Math.random,
): SoloSetup {
  const cats = resolveBotCats([setup.cat], setup.bots);
  const bots = setup.bots.map((bot, i) => {
    const own = cats[i]!;
    if (own !== cat) return { ...bot, cat: own };
    return { ...bot, cat: randomFreeCat([cat, ...cats], random) };
  });
  return { ...setup, cat, bots };
}

export function seatsFromSetup(setup: SoloSetup): SeatInfo[] {
  const cats = resolveBotCats([setup.cat], setup.bots);
  return [
    { id: 'p0', name: setup.name.trim() || null, cat: setup.cat, bot: null },
    ...setup.bots.map((bot, i) => ({
      id: `p${i + 1}`,
      name: null,
      cat: cats[i]!,
      bot: { personality: bot.personality, difficulty: bot.difficulty },
    })),
  ];
}

// ---- pass-and-play (several humans on one device, bots optional) ----

export type LocalPlayerSetup =
  | { readonly kind: 'human'; readonly name: string; readonly cat: CatColor }
  | { readonly kind: 'bot'; readonly bot: BotSeat; readonly cat?: CatColor | undefined };

export interface LocalSetup {
  readonly players: readonly LocalPlayerSetup[];
  readonly mode: GameMode;
}

/** Pass-and-play needs at least this many humans (one human is solo play). */
export const MIN_LOCAL_HUMANS = 2;
export const MAX_LOCAL_PLAYERS = 4;
const LOCAL_SETUP_KEY = 'mnm.localSetup.v1';

export const DEFAULT_LOCAL_SETUP: LocalSetup = {
  players: [
    { kind: 'human', name: '', cat: 'calico' },
    { kind: 'human', name: '', cat: 'orange' },
  ],
  mode: CLASSIC_MODE,
};

export function humanCount(setup: LocalSetup): number {
  return setup.players.filter((p) => p.kind === 'human').length;
}

/** A cat no other human has picked yet (every seat has its own cat). */
export function freeCat(setup: LocalSetup): CatColor {
  const taken = setup.players.flatMap((p) => (p.kind === 'human' ? [p.cat] : []));
  return CAT_COLORS.find((c) => !taken.includes(c)) ?? CAT_COLORS[0];
}

function isLocalPlayer(value: unknown): value is LocalPlayerSetup {
  const p = value as { kind?: unknown; name?: unknown; cat?: unknown; bot?: Partial<BotSeat> };
  if (p?.kind === 'human')
    return typeof p.name === 'string' && (CAT_COLORS as readonly unknown[]).includes(p.cat);
  if (p?.kind === 'bot')
    return (
      (BOT_PERSONALITIES as readonly unknown[]).includes(p.bot?.personality) &&
      (BOT_DIFFICULTIES as readonly unknown[]).includes(p.bot?.difficulty) &&
      (p.cat === undefined || (CAT_COLORS as readonly unknown[]).includes(p.cat))
    );
  return false;
}

export function loadLocalSetup(): LocalSetup {
  try {
    const raw = localStorage.getItem(LOCAL_SETUP_KEY);
    if (!raw) return DEFAULT_LOCAL_SETUP;
    const parsed = JSON.parse(raw) as { players?: unknown; mode?: unknown };
    const players = parsed.players;
    if (!Array.isArray(players) || !(players as unknown[]).every(isLocalPlayer))
      return DEFAULT_LOCAL_SETUP;
    const setup: LocalSetup = {
      players: (players as LocalPlayerSetup[]).map((p) =>
        p.kind === 'human' ? { ...p, name: p.name.slice(0, NAME_MAX_LENGTH) } : p,
      ),
      mode: readMode(parsed.mode),
    };
    const ok = setup.players.length <= MAX_LOCAL_PLAYERS && humanCount(setup) >= MIN_LOCAL_HUMANS;
    return ok ? setup : DEFAULT_LOCAL_SETUP;
  } catch {
    return DEFAULT_LOCAL_SETUP;
  }
}

export function storeLocalSetup(setup: LocalSetup): void {
  try {
    localStorage.setItem(LOCAL_SETUP_KEY, JSON.stringify(setup));
  } catch {
    // ignore
  }
}

/** Humans whose cat another human took first (they must pick again). */
export function catClashes(setup: LocalSetup): Set<number> {
  const seen = new Map<CatColor, number>();
  const clashes = new Set<number>();
  setup.players.forEach((p, i) => {
    if (p.kind !== 'human') return;
    if (seen.has(p.cat)) clashes.add(i);
    else seen.set(p.cat, i);
  });
  return clashes;
}

/** Every seat's cat as it will play (bots' stored cats, or one drawn for older setups). */
function localCats(setup: LocalSetup): CatColor[] {
  const humans = setup.players.flatMap((p) => (p.kind === 'human' ? [p.cat] : []));
  const bots = setup.players.flatMap((p) => (p.kind === 'bot' ? [{ ...p.bot, cat: p.cat }] : []));
  const botCatsNow = resolveBotCats(humans, bots);
  let nextBot = 0;
  return setup.players.map((p) => (p.kind === 'human' ? p.cat : botCatsNow[nextBot++]!));
}

/**
 * Pass-and-play: this person takes a cat. Another person's cat is refused (null); a bot
 * holding it draws another free one (people first — DECISIONS 052).
 */
export function localTakeCat(
  setup: LocalSetup,
  index: number,
  cat: CatColor,
  random: () => number = Math.random,
): LocalSetup | null {
  const cats = localCats(setup);
  const holder = cats.findIndex((c, i) => i !== index && c === cat);
  if (holder >= 0 && setup.players[holder]!.kind === 'human') return null;
  const players = setup.players.map((p, i): LocalPlayerSetup => {
    if (i === index && p.kind === 'human') return { ...p, cat };
    if (p.kind !== 'bot') return p;
    return { ...p, cat: i === holder ? randomFreeCat([cat, ...cats], random) : cats[i]! };
  });
  return { ...setup, players };
}

/** The cats already in use at this table (for a new seat). */
export function localTakenCats(setup: LocalSetup): CatColor[] {
  return localCats(setup);
}

export function seatsFromLocalSetup(setup: LocalSetup): SeatInfo[] {
  const cats = localCats(setup);
  return setup.players.map((p, i) =>
    p.kind === 'human'
      ? { id: `p${i}`, name: p.name.trim() || null, cat: p.cat, bot: null }
      : { id: `p${i}`, name: null, cat: cats[i]!, bot: p.bot },
  );
}
