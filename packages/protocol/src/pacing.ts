import type { Card, EventId, FoodType, GameEvent, Meal, PlayerId, PowerId } from '@meow/engine';

// Event pacing, shared by the web client (which plays the beats) and the online server
// (which waits for them before bots move). docs/ART_DIRECTION.md › แอนิเมชัน

/**
 * A "beat" is one thing the player should see happen, shown for long enough to read
 * (docs/ART_DIRECTION.md › แอนิเมชัน). The game holds (bots wait) while beats play;
 * tapping skips to the next one.
 */
export type Beat =
  | { readonly kind: 'round'; readonly round: number; readonly tieOrder: readonly PlayerId[] }
  | {
      readonly kind: 'reveal';
      readonly bids: Readonly<Record<PlayerId, number>>;
      readonly clashes: readonly {
        readonly value: number;
        readonly playerIds: readonly PlayerId[];
      }[];
    }
  | { readonly kind: 'pick'; readonly playerId: PlayerId; readonly card: Card }
  | { readonly kind: 'dug'; readonly playerId: PlayerId; readonly card: Card }
  | { readonly kind: 'dog'; readonly playerId: PlayerId; readonly canThrowBone: boolean }
  | { readonly kind: 'caught'; readonly playerId: PlayerId; readonly lost: readonly Card[] }
  | { readonly kind: 'bone'; readonly playerId: PlayerId }
  | { readonly kind: 'kept'; readonly playerId: PlayerId; readonly cards: readonly Card[] }
  | {
      readonly kind: 'meal';
      readonly playerId: PlayerId;
      readonly meal: Meal;
      readonly newPrice: number;
    }
  | { readonly kind: 'skipped'; readonly playerId: PlayerId }
  | { readonly kind: 'discarded'; readonly playerId: PlayerId; readonly cards: readonly Card[] }
  | { readonly kind: 'gameOver' }
  // ── cat powers (GAME_RULES §14) ──
  | { readonly kind: 'power'; readonly playerId: PlayerId; readonly power: PowerId }
  | {
      readonly kind: 'bidChanged';
      readonly playerId: PlayerId;
      readonly from: number;
      readonly to: number;
    }
  | { readonly kind: 'swapped'; readonly playerId: PlayerId; readonly out: Card; readonly in: Card }
  | { readonly kind: 'scavenged'; readonly playerId: PlayerId; readonly card: Card }
  | { readonly kind: 'price'; readonly food: FoodType; readonly from: number; readonly to: number }
  | { readonly kind: 'restored'; readonly playerIds: readonly PlayerId[] }
  // ── market events (GAME_RULES §15) ──
  | { readonly kind: 'event'; readonly round: number; readonly event: EventId }
  | { readonly kind: 'gift'; readonly playerId: PlayerId; readonly card: Card }
  | { readonly kind: 'slept'; readonly playerId: PlayerId }
  /** Gusty Wind: a pass-a-card phase begins (rules differ from a normal round). */
  | { readonly kind: 'passStart'; readonly passers: readonly PlayerId[] }
  | {
      readonly kind: 'passed';
      readonly passes: readonly {
        readonly from: PlayerId;
        readonly to: PlayerId;
        readonly card: Card;
      }[];
    };

export type BeatKind = Beat['kind'];

// ---------------------------------------------------------------- how long beats stay up
// Popups (the big moments) cover the board for at least POPUP_MIN_MS, longer when there is
// more to read; everything else is a toast you can play through. Speeds only stretch or
// shrink the reading time — never below the minimum (DECISIONS 051).

export const GAME_SPEEDS = ['slow', 'normal', 'fast'] as const;
export type GameSpeed = (typeof GAME_SPEEDS)[number];
export const DEFAULT_SPEED: GameSpeed = 'normal';
export const SPEED_FACTOR: Readonly<Record<GameSpeed, number>> = {
  slow: 1.5,
  normal: 1,
  fast: 0.7,
};

/** Reading speed depends on the language (Thai is read more slowly per character). */
export type ReadLang = 'th' | 'en';
export const READ_LANGS: readonly ReadLang[] = ['th', 'en'];

export const POPUP_MIN_MS = 3_000;
/** Time to notice a popup before reading it. */
const NOTICE_MS = 1_000;
export const MS_PER_CHAR: Readonly<Record<ReadLang, number>> = { th: 80, en: 50 };
/** A name or a card is recognised at a glance (the cat / the picture is right there). */
const NAME_CHARS = 6;
/** Extra time on the reveal when numbers clashed, so the clash animation can land. */
export const CLASH_EXTRA_MS = 900;
/** Your own small moves (digging, picking…) flash briefly and never block the next tap. */
export const OWN_MOVE_MS = 450;

/** The big moments: they cover the board (tap to close early). */
const POPUP_KINDS: readonly BeatKind[] = [
  'round',
  'reveal',
  'event',
  'dog',
  'caught',
  'slept',
  'power',
  'passStart',
  'passed',
  'gameOver',
];
/** Popups with rules that change play: solo / pass-and-play wait for "Got it". */
const PINNED_KINDS: readonly BeatKind[] = ['event', 'passStart'];
/** Toasts: how long each stays (normal speed). */
export const TOAST_MS: Readonly<Partial<Record<BeatKind, number>>> = {
  pick: 750,
  dug: 650,
  kept: 850,
  scavenged: 850,
  price: 900,
  gift: 850,
  meal: 2000,
  skipped: 1500,
  bone: 1500,
  discarded: 1500,
  bidChanged: 1800,
  swapped: 1800,
  restored: 2000,
};
/** Your own moves that need no announcement to yourself. */
const OWN_LIGHT_KINDS: readonly BeatKind[] = [
  'pick',
  'dug',
  'kept',
  'bone',
  'discarded',
  'scavenged',
  'gift',
];

/**
 * Characters of fixed text in each popup's i18n strings (placeholders removed), [th, en].
 * Kept in step with apps/web/src/i18n by apps/web/test/pacing.test.ts.
 */
export const POPUP_TEXT: Readonly<Record<string, readonly [number, number]>> = {
  'feed.round': [18, 14],
  'term.tieOrder': [15, 15],
  'stage.reveal': [24, 15],
  'stage.noClash': [10, 10],
  'feed.clash': [13, 16],
  'stage.eventTitle': [15, 12],
  'stage.bark': [5, 5],
  'feed.dog': [20, 23],
  'feed.caught_other': [23, 27],
  'feed.slept': [26, 42],
  'stage.powerUsed': [1, 1],
  'feed.power': [8, 6],
  'stage.passStart': [44, 54],
  'feed.passed': [25, 36],
  'eventName.gustyWind': [5, 10],
  'stage.gameOver': [12, 22],
};
/** Event name + description, [th, en]. */
export const EVENT_TEXT: Readonly<Record<EventId, readonly [number, number]>> = {
  downpour: [37, 68],
  seafoodFest: [43, 52],
  milkDelivery: [41, 64],
  garbageTruck: [38, 51],
  blackout: [43, 51],
  kindVendor: [41, 49],
  bargainRush: [39, 48],
  sleepyDogs: [44, 62],
  gustyWind: [47, 78],
  queueFlip: [40, 58],
  busyNight: [29, 40],
  fullMoon: [44, 41],
  snackSale: [31, 54],
};
/** Power names (shown twice in the popup), [th, en]. */
export const POWER_TEXT: Readonly<Record<PowerId, readonly [number, number]>> = {
  keenNose: [6, 9],
  secondThought: [9, 14],
  scavenger: [11, 9],
  luckySwap: [5, 10],
  goodLuck: [8, 13],
  extraOrder: [9, 11],
  haggle: [7, 6],
  bigAppetite: [5, 12],
};

/** Roughly how many characters a popup asks the player to read. */
export function popupChars(beat: Beat, lang: ReadLang): number {
  const i = lang === 'th' ? 0 : 1;
  const text = (...keys: string[]) => keys.reduce((sum, k) => sum + (POPUP_TEXT[k]?.[i] ?? 0), 0);
  const names = (n: number) => n * NAME_CHARS;
  switch (beat.kind) {
    case 'round':
      return text('feed.round', 'term.tieOrder') + names(beat.tieOrder.length);
    case 'reveal': {
      const clashers = beat.clashes.reduce((n, c) => n + c.playerIds.length, 0);
      const clashText =
        beat.clashes.length > 0
          ? beat.clashes.length * text('feed.clash') + names(clashers)
          : text('stage.noClash');
      return text('stage.reveal') + clashText + names(Object.keys(beat.bids).length);
    }
    case 'event':
      return text('stage.eventTitle') + EVENT_TEXT[beat.event][i];
    case 'dog':
      return text('stage.bark', 'feed.dog') + names(1);
    case 'caught':
      return text('feed.caught_other') + names(1);
    case 'slept':
      return text('feed.slept') + names(1);
    case 'power':
      return text('stage.powerUsed', 'feed.power') + 2 * POWER_TEXT[beat.power][i] + names(1);
    case 'passStart':
      return text('eventName.gustyWind', 'stage.passStart');
    case 'passed':
      return text('eventName.gustyWind', 'feed.passed') + beat.passes.length * names(3);
    case 'gameOver':
      return text('stage.gameOver');
    default:
      return 0;
  }
}

/** How to pace beats: the reader's language (or the slowest one) and the game speed. */
export interface Pace {
  readonly speed: GameSpeed;
  /** 'slowest' = the longest time any language needs (the online server waits that long). */
  readonly lang: ReadLang | 'slowest';
}
export const DEFAULT_PACE: Pace = { speed: DEFAULT_SPEED, lang: 'slowest' };

export function isOwnLightBeat(beat: Beat, viewer: PlayerId | null): boolean {
  return 'playerId' in beat && beat.playerId === viewer && OWN_LIGHT_KINDS.includes(beat.kind);
}

/** Popups cover the board (tap to close early); the rest are toasts you can play through. */
export function isBlocking(beat: Beat, viewer: PlayerId | null): boolean {
  return POPUP_KINDS.includes(beat.kind) && !isOwnLightBeat(beat, viewer);
}

/** Popups that wait for "Got it" when nobody else is waiting (solo, pass-and-play). */
export function isPinned(beat: Beat): boolean {
  return PINNED_KINDS.includes(beat.kind);
}

export function beatDuration(
  beat: Beat,
  viewer: PlayerId | null = null,
  pace: Pace = DEFAULT_PACE,
): number {
  const factor = SPEED_FACTOR[pace.speed];
  if (isOwnLightBeat(beat, viewer)) return Math.round(OWN_MOVE_MS * factor);
  if (!isBlocking(beat, viewer)) return Math.round((TOAST_MS[beat.kind] ?? 1000) * factor);
  const langs = pace.lang === 'slowest' ? READ_LANGS : [pace.lang];
  const reading = Math.max(...langs.map((l) => NOTICE_MS + popupChars(beat, l) * MS_PER_CHAR[l]));
  const clash = beat.kind === 'reveal' && beat.clashes.length > 0 ? CLASH_EXTRA_MS : 0;
  return Math.max(POPUP_MIN_MS, Math.round(reading * factor + clash));
}

/**
 * Turns an engine event stream into beats. Bookkeeping events (turn starts, dogs going
 * back into the bin…) are silent; a bid reveal and its clashes become one beat.
 */
export function toBeats(events: readonly GameEvent[]): Beat[] {
  const beats: Beat[] = [];
  for (const event of events) {
    switch (event.type) {
      case 'ROUND_STARTED':
        beats.push({ kind: 'round', round: event.round, tieOrder: event.tieOrder });
        break;
      case 'BIDS_REVEALED':
        beats.push({ kind: 'reveal', bids: event.bids, clashes: [] });
        break;
      case 'BID_CLASH': {
        const last = beats.at(-1);
        if (last?.kind === 'reveal') {
          beats[beats.length - 1] = {
            ...last,
            clashes: [...last.clashes, { value: event.value, playerIds: event.playerIds }],
          };
        }
        break;
      }
      case 'CARD_PICKED':
        beats.push({ kind: 'pick', playerId: event.playerId, card: event.card });
        break;
      case 'CARD_DUG':
        if (event.to !== 'dog')
          beats.push({ kind: 'dug', playerId: event.playerId, card: event.card });
        break;
      case 'DOG_APPEARED':
        beats.push({ kind: 'dog', playerId: event.playerId, canThrowBone: event.canThrowBone });
        break;
      case 'DOG_CAUGHT':
        beats.push({ kind: 'caught', playerId: event.playerId, lost: event.lost });
        break;
      case 'BONE_THROWN':
        beats.push({ kind: 'bone', playerId: event.playerId });
        break;
      case 'BAG_KEPT':
        beats.push({ kind: 'kept', playerId: event.playerId, cards: event.cards });
        break;
      case 'MEAL_EATEN':
        beats.push({
          kind: 'meal',
          playerId: event.playerId,
          meal: event.meal,
          newPrice: event.newPrice,
        });
        break;
      case 'TURN_SKIPPED':
        beats.push({ kind: 'skipped', playerId: event.playerId });
        break;
      case 'CARDS_DISCARDED':
        beats.push({ kind: 'discarded', playerId: event.playerId, cards: event.cards });
        break;
      case 'GAME_OVER':
        beats.push({ kind: 'gameOver' });
        break;
      case 'POWER_USED':
        beats.push({ kind: 'power', playerId: event.playerId, power: event.power });
        break;
      case 'BID_CHANGED':
        beats.push({
          kind: 'bidChanged',
          playerId: event.playerId,
          from: event.from,
          to: event.to,
        });
        break;
      case 'MARKET_SWAPPED':
        beats.push({ kind: 'swapped', playerId: event.playerId, out: event.out, in: event.in });
        break;
      case 'CARD_SCAVENGED':
        beats.push({ kind: 'scavenged', playerId: event.playerId, card: event.card });
        break;
      case 'PRICE_CHANGED':
        beats.push({ kind: 'price', food: event.food, from: event.from, to: event.to });
        break;
      case 'POWERS_RESTORED':
        beats.push({ kind: 'restored', playerIds: event.playerIds });
        break;
      case 'EVENT_REVEALED':
        beats.push({ kind: 'event', round: event.round, event: event.event });
        break;
      case 'VENDOR_GIFT':
        beats.push({ kind: 'gift', playerId: event.playerId, card: event.card });
        break;
      case 'DOG_SLEPT':
        beats.push({ kind: 'slept', playerId: event.playerId });
        break;
      case 'PHASE_STARTED':
        if (event.phase === 'pass') beats.push({ kind: 'passStart', passers: event.turnOrder });
        break;
      case 'CARDS_PASSED':
        beats.push({ kind: 'passed', passes: event.passes });
        break;
      default:
        break;
    }
  }
  return beats;
}

/**
 * How long the screens need to show these events (every beat at full length, as someone
 * who did not make the move sees them, in the slowest language). The online server waits
 * `totalMs` before a bot moves, and `popupEndMs` before anyone may act (DECISIONS 051).
 */
export function showTiming(
  events: readonly GameEvent[],
  speed: GameSpeed = DEFAULT_SPEED,
): { totalMs: number; popupEndMs: number } {
  return beatsTiming(toBeats(events), speed);
}

export function beatsTiming(
  beats: readonly Beat[],
  speed: GameSpeed = DEFAULT_SPEED,
): { totalMs: number; popupEndMs: number } {
  let totalMs = 0;
  let popupEndMs = 0;
  for (const beat of beats) {
    totalMs += beatDuration(beat, null, { speed, lang: 'slowest' });
    if (isBlocking(beat, null)) popupEndMs = totalMs;
  }
  return { totalMs, popupEndMs };
}

/** The beats a fresh game opens with (its first event card, then the round banner). */
export function openingBeats(game: {
  readonly round: number;
  readonly tieOrder: readonly PlayerId[];
  readonly event: EventId | null;
}): Beat[] {
  const beats: Beat[] = [];
  if (game.event) beats.push({ kind: 'event', round: game.round, event: game.event });
  beats.push({ kind: 'round', round: game.round, tieOrder: game.tieOrder });
  return beats;
}
