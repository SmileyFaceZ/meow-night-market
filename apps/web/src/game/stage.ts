import type { GameEvent, PlayerId } from '@meow/engine';
import type { Beat } from '@meow/protocol';
import type { CatMood } from '../art/CatArt';

// Beats and their timing live in @meow/protocol (the online server paces bots by them);
// this module adds what only the screen needs: new-event tracking and cat faces.
export {
  BEAT_MS,
  type Beat,
  type BeatKind,
  beatDuration,
  CLASH_EXTRA_MS,
  isBlocking,
  isOwnLightBeat,
  OWN_MOVE_MS,
  toBeats,
} from '@meow/protocol';

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
    case 'power':
    case 'bidChanged':
    case 'swapped':
    case 'scavenged':
    case 'gift':
    case 'slept':
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
