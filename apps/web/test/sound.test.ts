import type { Beat } from '@meow/protocol';
import { describe, expect, it } from 'vitest';
import { gainFor, isSoundId, isTapSound, SOUND_IDS, soundForBeat } from '../src/audio/cues';
import { createSoundStore, DEFAULT_SOUND, parseSoundSettings } from '../src/audio/settings';
import { memoryStorage } from './helpers';

describe('sound settings', () => {
  it('start on, and quiet', () => {
    expect(DEFAULT_SOUND).toEqual({ enabled: true, volume: 0.4, clicks: true, effects: true });
    expect(parseSoundSettings(null)).toEqual(DEFAULT_SOUND);
  });

  it('survive junk in storage, field by field', () => {
    expect(parseSoundSettings('not json')).toEqual(DEFAULT_SOUND);
    expect(parseSoundSettings('42')).toEqual(DEFAULT_SOUND);
    expect(parseSoundSettings('{"enabled":"yes","volume":7,"clicks":false}')).toEqual({
      ...DEFAULT_SOUND,
      volume: 1,
      clicks: false,
    });
    expect(parseSoundSettings('{"volume":-3}').volume).toBe(0);
  });

  it('are saved, reloaded and announced to listeners', () => {
    const storage = memoryStorage();
    const store = createSoundStore(storage);
    let calls = 0;
    const stop = store.subscribe(() => calls++);
    store.set({ volume: 0.75, effects: false });
    expect(calls).toBe(1);
    stop();
    store.set({ enabled: false });
    expect(calls).toBe(1);
    expect(createSoundStore(storage).get()).toEqual({
      enabled: false,
      volume: 0.75,
      clicks: true,
      effects: false,
    });
  });

  it('keep working without storage', () => {
    const store = createSoundStore(null);
    store.set({ volume: 0.2 });
    expect(store.get().volume).toBe(0.2);
  });
});

describe('what plays', () => {
  it('respects the master switch, the volume and each group', () => {
    const on = { ...DEFAULT_SOUND, volume: 0.6 };
    expect(gainFor('click', on)).toBe(0.6);
    expect(gainFor('woof', on)).toBe(0.6);
    expect(gainFor('click', { ...on, enabled: false })).toBe(0);
    expect(gainFor('click', { ...on, clicks: false })).toBe(0);
    expect(gainFor('woof', { ...on, clicks: false })).toBe(0.6);
    expect(gainFor('woof', { ...on, effects: false })).toBe(0);
    expect(gainFor('meow', { ...on, volume: 0 })).toBe(0);
  });

  it('sorts taps from game sounds', () => {
    expect(SOUND_IDS.filter(isTapSound)).toEqual(['click', 'nope', 'card', 'meow']);
    expect(isSoundId('woof')).toBe(true);
    expect(isSoundId('moo')).toBe(false);
  });

  it('gives every beat a sound, except your own pick (the tap already made one)', () => {
    const card = { id: 1, kind: 'fish' } as const;
    const beats: Beat[] = [
      { kind: 'round', round: 1, tieOrder: ['p0'] },
      { kind: 'reveal', bids: {}, clashes: [] },
      { kind: 'reveal', bids: {}, clashes: [{ value: 3, playerIds: ['p0', 'p1'] }] },
      { kind: 'pick', playerId: 'p1', card },
      { kind: 'dug', playerId: 'p0', card },
      { kind: 'dog', playerId: 'p0', canThrowBone: true },
      { kind: 'caught', playerId: 'p0', lost: [] },
      { kind: 'bone', playerId: 'p0' },
      { kind: 'kept', playerId: 'p0', cards: [] },
      {
        kind: 'meal',
        playerId: 'p0',
        meal: { round: 1, food: 'fish', cards: [card], big: false, price: 5, points: 5 },
        newPrice: 4,
      },
      { kind: 'skipped', playerId: 'p1' },
      { kind: 'discarded', playerId: 'p1', cards: [] },
      { kind: 'gameOver' },
    ];
    expect(beats.map((b) => soundForBeat(b, 'p0'))).toEqual([
      'round',
      'reveal',
      'clash',
      'card',
      'dig',
      'woof',
      'caught',
      'bone',
      'kept',
      'eat',
      'skip',
      'discard',
      'fanfare',
    ]);
    expect(soundForBeat({ kind: 'pick', playerId: 'p0', card }, 'p0')).toBeNull();
  });
});
