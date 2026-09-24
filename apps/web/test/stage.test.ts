import type { GameEvent } from '@meow/engine';
import { describe, expect, it } from 'vitest';
import {
  beatDuration,
  BEAT_MS,
  CLASH_EXTRA_MS,
  isBlocking,
  moodsWhenBeatEnds,
  moodsWhenBeatStarts,
  newEvents,
  OWN_MOVE_MS,
  toBeats,
} from '../src/game/stage';

const fish = { id: 1, kind: 'fish' } as const;

describe('stage beats', () => {
  it('merges a bid reveal and its clashes into one beat', () => {
    const events: GameEvent[] = [
      { type: 'BID_PLACED', playerId: 'a' },
      { type: 'BIDS_REVEALED', bids: { a: 3, b: 3, c: 1 } },
      { type: 'BID_CLASH', value: 3, playerIds: ['a', 'b'] },
      { type: 'PHASE_STARTED', phase: 'pick', turnOrder: ['c', 'a', 'b'] },
      { type: 'TURN_STARTED', playerId: 'c' },
    ];
    const beats = toBeats(events);
    expect(beats).toEqual([
      {
        kind: 'reveal',
        bids: { a: 3, b: 3, c: 1 },
        clashes: [{ value: 3, playerIds: ['a', 'b'] }],
      },
    ]);
    expect(beatDuration(beats[0]!)).toBe(BEAT_MS.reveal + CLASH_EXTRA_MS);
  });

  it('keeps the key moments and drops bookkeeping events', () => {
    const events: GameEvent[] = [
      { type: 'CARD_DUG', playerId: 'a', card: fish, to: 'bag' },
      { type: 'CARD_DUG', playerId: 'a', card: { id: 2, kind: 'dog' }, to: 'dog' },
      { type: 'DOG_APPEARED', playerId: 'a', canThrowBone: false },
      { type: 'DOG_CAUGHT', playerId: 'a', lost: [fish] },
      { type: 'DOG_RETURNED' },
      { type: 'TURN_STARTED', playerId: 'b' },
      { type: 'TURN_SKIPPED', playerId: 'b' },
    ];
    expect(toBeats(events).map((b) => b.kind)).toEqual(['dug', 'dog', 'caught', 'skipped']);
  });

  it('every beat stays up long enough to read (≥ 0.6 s)', () => {
    for (const ms of Object.values(BEAT_MS)) expect(ms).toBeGreaterThanOrEqual(600);
    expect(BEAT_MS.skipped).toBeGreaterThanOrEqual(1000);
  });

  it('finds only the events the UI has not seen yet', () => {
    const recent: GameEvent[] = [
      { type: 'DOG_RETURNED' },
      { type: 'TURN_SKIPPED', playerId: 'a' },
      { type: 'TURN_SKIPPED', playerId: 'b' },
    ];
    expect(newEvents(recent, 10, 8)).toEqual(recent.slice(1));
    expect(newEvents(recent, 10, 10)).toEqual([]);
    expect(newEvents(recent, 50, 10)).toEqual(recent); // more than kept: show what we have
  });

  it('announces big moments; small moves are toasts; your own small moves are quick', () => {
    const dug = { kind: 'dug', playerId: 'b', card: fish } as const;
    expect(isBlocking(dug, 'a')).toBe(false);
    expect(isBlocking({ kind: 'skipped', playerId: 'b' }, 'a')).toBe(true);
    expect(isBlocking({ kind: 'bone', playerId: 'b' }, 'a')).toBe(true);
    expect(isBlocking({ kind: 'bone', playerId: 'a' }, 'a')).toBe(false);
    expect(beatDuration({ ...dug, playerId: 'a' }, 'a')).toBe(OWN_MOVE_MS);
    expect(beatDuration(dug, 'a')).toBe(BEAT_MS.dug);
  });

  it('cat faces: full and happy last the round, shock fades, a new round resets', () => {
    const meal = { round: 1, food: 'fish' as const, cards: [], big: false, price: 5, points: 5 };
    let moods = moodsWhenBeatStarts({}, { kind: 'meal', playerId: 'a', meal, newPrice: 4 });
    expect(moods).toEqual({ a: 'full' });
    moods = moodsWhenBeatStarts(moods, { kind: 'caught', playerId: 'b', lost: [] });
    expect(moods).toEqual({ a: 'full', b: 'shocked' });
    moods = moodsWhenBeatEnds(moods);
    expect(moods).toEqual({ a: 'full' });
    moods = moodsWhenBeatStarts(moods, {
      kind: 'reveal',
      bids: { a: 2, b: 2 },
      clashes: [{ value: 2, playerIds: ['a', 'b'] }],
    });
    expect(moods).toEqual({ a: 'shocked', b: 'shocked' });
    expect(moodsWhenBeatStarts(moods, { kind: 'round', round: 2, tieOrder: [] })).toEqual({});
  });
});
