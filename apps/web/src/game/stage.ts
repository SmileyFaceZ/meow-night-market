import type { Card, GameEvent, Meal, PlayerId } from '@meow/engine';
import type { CatMood } from '../art/CatArt';

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
  | { readonly kind: 'gameOver' };

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
};

/** Extra time on the reveal when numbers clashed, so the clash can land. */
export const CLASH_EXTRA_MS = 900;

/** Your own small moves (digging, picking…) flash briefly and never block the next tap. */
export const OWN_MOVE_MS = 450;
/** Small moves anyone makes: shown as a toast that does not cover the board. */
const TOAST_KINDS: readonly BeatKind[] = ['pick', 'dug', 'kept'];
/** Your own moves that need no announcement to yourself. */
const OWN_LIGHT_KINDS: readonly BeatKind[] = ['pick', 'dug', 'kept', 'bone', 'discarded'];

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
      default:
        break;
    }
  }
  return beats;
}

/** Which of the recent events are new since the UI last looked. */
export function newEvents(
  recent: readonly GameEvent[],
  eventCount: number,
  seenCount: number,
): readonly GameEvent[] {
  const fresh = Math.min(recent.length, Math.max(0, eventCount - seenCount));
  return fresh === 0 ? [] : recent.slice(recent.length - fresh);
}

/** The mood a beat puts a cat in (used here and by the player badges). */
export function moodFromBeat(beat: Beat | null, playerId: PlayerId): CatMood | null {
  if (!beat) return null;
  switch (beat.kind) {
    case 'reveal':
      return beat.clashes.some((c) => c.playerIds.includes(playerId)) ? 'shocked' : null;
    case 'dog':
    case 'caught':
      return beat.playerId === playerId ? 'shocked' : null;
    case 'meal':
      return beat.playerId === playerId ? 'full' : null;
    case 'bone':
    case 'kept':
    case 'pick':
      return beat.playerId === playerId ? 'happy' : null;
    default:
      return null;
  }
}

export type Moods = Readonly<Record<PlayerId, CatMood>>;

/**
 * Cat faces follow the events (docs/ART_DIRECTION.md › ตัวละคร): full after a meal and
 * happy after a good grab last for the rest of the round; shock lasts only while the dog
 * barks or the clash lands. A new round resets everyone.
 */
export function moodsWhenBeatStarts(moods: Moods, beat: Beat): Moods {
  if (beat.kind === 'round') return {};
  if (beat.kind === 'reveal') {
    const next = { ...moods };
    for (const c of beat.clashes) for (const id of c.playerIds) next[id] = 'shocked';
    return next;
  }
  if (!('playerId' in beat)) return moods;
  const mood = moodFromBeat(beat, beat.playerId);
  return mood ? { ...moods, [beat.playerId]: mood } : moods;
}

export function moodsWhenBeatEnds(moods: Moods): Moods {
  const next: Record<PlayerId, CatMood> = {};
  for (const [id, mood] of Object.entries(moods)) if (mood !== 'shocked') next[id] = mood;
  return next;
}
