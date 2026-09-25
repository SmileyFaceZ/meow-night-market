import type { PlayerId } from '@meow/engine';
import type { Beat } from '@meow/protocol';
import type { SoundSettings } from './settings';

// Which sound goes with what (pure, so it can be tested without Web Audio).

export const SOUND_IDS = [
  // taps
  'click',
  'nope',
  'card',
  'meow',
  // game
  'round',
  'reveal',
  'clash',
  'dig',
  'woof',
  'caught',
  'bone',
  'kept',
  'eat',
  'skip',
  'discard',
  'fanfare',
  'turn',
  'tick',
  'pop',
  'power',
  'event',
] as const;
export type SoundId = (typeof SOUND_IDS)[number];

/** Taps are "clicks" in the settings; everything else is a game effect. */
const TAP_SOUNDS: readonly SoundId[] = ['click', 'nope', 'card', 'meow'];

export function isTapSound(id: SoundId): boolean {
  return TAP_SOUNDS.includes(id);
}

export function isSoundId(value: string): value is SoundId {
  return (SOUND_IDS as readonly string[]).includes(value);
}

/** Final loudness 0–1 for a sound under these settings (0 = do not play). */
export function gainFor(id: SoundId, settings: SoundSettings): number {
  if (!settings.enabled) return 0;
  if (isTapSound(id) ? !settings.clicks : !settings.effects) return 0;
  return settings.volume;
}

/**
 * The sound for a beat as it appears on screen. Your own small moves already made a
 * tap sound when you tapped, so they stay quiet here.
 */
export function soundForBeat(beat: Beat, viewer: PlayerId | null): SoundId | null {
  const mine = 'playerId' in beat && beat.playerId === viewer;
  switch (beat.kind) {
    case 'round':
      return 'round';
    case 'reveal':
      return beat.clashes.length > 0 ? 'clash' : 'reveal';
    case 'pick':
      return mine ? null : 'card';
    case 'dug':
      return 'dig';
    case 'dog':
      return 'woof';
    case 'caught':
      return 'caught';
    case 'bone':
      return 'bone';
    case 'kept':
      return 'kept';
    case 'meal':
      return 'eat';
    case 'skipped':
      return 'skip';
    case 'discarded':
      return 'discard';
    case 'gameOver':
      return 'fanfare';
    case 'power':
    case 'restored':
      return 'power';
    case 'bidChanged':
    case 'swapped':
      return 'card';
    case 'scavenged':
    case 'gift':
      return mine ? null : 'kept';
    case 'price':
      return 'pop';
    case 'event':
      return 'event';
    case 'slept':
      return 'skip';
    case 'passed':
      return 'discard';
  }
}
