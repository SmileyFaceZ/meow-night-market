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
  | {
      readonly kind: 'passed';
      readonly passes: readonly {
        readonly from: PlayerId;
        readonly to: PlayerId;
        readonly card: Card;
      }[];
    };

export type BeatKind = Beat['kind'];

/** How long each beat stays on screen (ms). Reading time matters more than motion. */
export const BEAT_MS: Record<BeatKind, number> = {
  round: 1500,
  reveal: 1700,
  pick: 750,
  dug: 650,
  dog: 1300,
  caught: 1200,
  bone: 1000,
  kept: 850,
  meal: 1500,
  skipped: 1200,
  discarded: 1000,
  gameOver: 1200,
  power: 1400,
  bidChanged: 1300,
  swapped: 1300,
  scavenged: 850,
  price: 900,
  restored: 1300,
  event: 2200,
  gift: 850,
  slept: 1200,
  passed: 1600,
};

/** Extra time on the reveal when numbers clashed, so the clash can land. */
export const CLASH_EXTRA_MS = 900;

/** Your own small moves (digging, picking…) flash briefly and never block the next tap. */
export const OWN_MOVE_MS = 450;
/** Small moves anyone makes: shown as a toast that does not cover the board. */
const TOAST_KINDS: readonly BeatKind[] = ['pick', 'dug', 'kept', 'scavenged', 'price', 'gift'];
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

export function isOwnLightBeat(beat: Beat, viewer: PlayerId | null): boolean {
  return 'playerId' in beat && beat.playerId === viewer && OWN_LIGHT_KINDS.includes(beat.kind);
}

/** Blocking beats dim the board (tap to skip); the rest are toasts you can play through. */
export function isBlocking(beat: Beat, viewer: PlayerId | null): boolean {
  return !TOAST_KINDS.includes(beat.kind) && !isOwnLightBeat(beat, viewer);
}

export function beatDuration(beat: Beat, viewer: PlayerId | null = null): number {
  if (isOwnLightBeat(beat, viewer)) return OWN_MOVE_MS;
  return (
    BEAT_MS[beat.kind] + (beat.kind === 'reveal' && beat.clashes.length > 0 ? CLASH_EXTRA_MS : 0)
  );
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
 * How long the screen needs to show these events (every beat at full length, as someone
 * who did not make the move sees them). The online server waits this long before a bot moves.
 */
export function showTimeMs(events: readonly GameEvent[]): number {
  return toBeats(events).reduce((sum, beat) => sum + beatDuration(beat, null), 0);
}
