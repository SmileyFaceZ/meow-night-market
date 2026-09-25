import { BOT_DIFFICULTIES, BOT_PERSONALITIES, type BotPersonality } from '@meow/engine';
import { type BotSeat, CAT_COLORS, type CatColor, NAME_MAX_LENGTH, type SeatInfo } from './types';

export interface SoloSetup {
  readonly name: string;
  readonly cat: CatColor;
  readonly bots: readonly BotSeat[];
}

const SETUP_KEY = 'mnm.setup.v1';

/** Each bot personality has its own cat colour (matching its name). */
export const BOT_CAT: Record<BotPersonality, CatColor> = {
  greedy: 'orange',
  sly: 'black',
  careful: 'white',
};

export const DEFAULT_SETUP: SoloSetup = {
  name: '',
  cat: 'calico',
  bots: [
    { personality: 'greedy', difficulty: 'normal' },
    { personality: 'careful', difficulty: 'normal' },
  ],
};

export function loadSetup(): SoloSetup {
  try {
    const raw = localStorage.getItem(SETUP_KEY);
    if (!raw) return DEFAULT_SETUP;
    const data = JSON.parse(raw) as SoloSetup;
    if (!Array.isArray(data.bots)) return DEFAULT_SETUP;
    const bots = data.bots as readonly Partial<BotSeat>[];
    const valid =
      typeof data.name === 'string' &&
      (CAT_COLORS as readonly string[]).includes(data.cat) &&
      bots.length >= 1 &&
      bots.length <= 3 &&
      bots.every(
        (b) =>
          (BOT_PERSONALITIES as readonly unknown[]).includes(b.personality) &&
          (BOT_DIFFICULTIES as readonly unknown[]).includes(b.difficulty),
      );
    return valid ? { ...data, name: data.name.slice(0, NAME_MAX_LENGTH) } : DEFAULT_SETUP;
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

export function seatsFromSetup(setup: SoloSetup): SeatInfo[] {
  return [
    { id: 'p0', name: setup.name.trim() || null, cat: setup.cat, bot: null },
    ...setup.bots.map((bot, i) => ({
      id: `p${i + 1}`,
      name: null,
      cat: BOT_CAT[bot.personality],
      bot,
    })),
  ];
}

// ---- pass-and-play (several humans on one device, bots optional) ----

export type LocalPlayerSetup =
  | { readonly kind: 'human'; readonly name: string; readonly cat: CatColor }
  | { readonly kind: 'bot'; readonly bot: BotSeat };

export interface LocalSetup {
  readonly players: readonly LocalPlayerSetup[];
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
};

export function humanCount(setup: LocalSetup): number {
  return setup.players.filter((p) => p.kind === 'human').length;
}

/** A cat colour no other human has picked yet (duplicates are allowed, just not by default). */
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
      (BOT_DIFFICULTIES as readonly unknown[]).includes(p.bot?.difficulty)
    );
  return false;
}

export function loadLocalSetup(): LocalSetup {
  try {
    const raw = localStorage.getItem(LOCAL_SETUP_KEY);
    if (!raw) return DEFAULT_LOCAL_SETUP;
    const players = (JSON.parse(raw) as { players?: unknown }).players;
    if (!Array.isArray(players) || !(players as unknown[]).every(isLocalPlayer))
      return DEFAULT_LOCAL_SETUP;
    const setup: LocalSetup = {
      players: (players as LocalPlayerSetup[]).map((p) =>
        p.kind === 'human' ? { ...p, name: p.name.slice(0, NAME_MAX_LENGTH) } : p,
      ),
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

export function seatsFromLocalSetup(setup: LocalSetup): SeatInfo[] {
  return setup.players.map((p, i) =>
    p.kind === 'human'
      ? { id: `p${i}`, name: p.name.trim() || null, cat: p.cat, bot: null }
      : { id: `p${i}`, name: null, cat: BOT_CAT[p.bot.personality], bot: p.bot },
  );
}
