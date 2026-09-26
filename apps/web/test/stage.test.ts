import type { GameEvent } from '@meow/engine';
import { describe, expect, it } from 'vitest';
import {
  beatDuration,
  isBlocking,
  isPinned,
  openingBeats,
  moodsWhenBeatEnds,
  moodsWhenBeatStarts,
  newEvents,
  OWN_MOVE_MS,
  POPUP_MIN_MS,
  toBeats,
  TOAST_MS,
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
    const calm = { ...beats[0]!, clashes: [] } as const;
    expect(beatDuration(beats[0]!)).toBeGreaterThan(beatDuration(calm)); // the clash lands
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

  it('popups stay ≥ 3 s (DECISIONS 051); toasts long enough to read (≥ 0.6 s)', () => {
    for (const ms of Object.values(TOAST_MS)) expect(ms).toBeGreaterThanOrEqual(600);
    const round = { kind: 'round', round: 1, tieOrder: ['a'] } as const;
    expect(beatDuration(round, null, { speed: 'fast', lang: 'en' })).toBe(POPUP_MIN_MS);
  });

  it('opens a game with its first event card, then the round banner', () => {
    const base = { round: 1, tieOrder: ['a', 'b'] };
    expect(openingBeats({ ...base, event: null }).map((b) => b.kind)).toEqual(['round']);
    expect(openingBeats({ ...base, event: 'blackout' }).map((b) => b.kind)).toEqual([
      'event',
      'round',
    ]);
  });

  it('rules-changing popups wait for "Got it" (solo, pass-and-play)', () => {
    expect(isPinned({ kind: 'event', round: 1, event: 'gustyWind' })).toBe(true);
    const [start] = toBeats([{ type: 'PHASE_STARTED', phase: 'pass', turnOrder: ['a', 'b'] }]);
    expect(start).toEqual({ kind: 'passStart', passers: ['a', 'b'] });
    expect(isPinned(start!)).toBe(true);
    expect(isPinned({ kind: 'round', round: 1, tieOrder: [] })).toBe(false);
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
    // only the big moments cover the board; meals, skips and bones are toasts now
    expect(isBlocking({ kind: 'dog', playerId: 'b', canThrowBone: true }, 'a')).toBe(true);
    expect(isBlocking({ kind: 'skipped', playerId: 'b' }, 'a')).toBe(false);
    expect(isBlocking({ kind: 'bone', playerId: 'b' }, 'a')).toBe(false);
    expect(beatDuration({ ...dug, playerId: 'a' }, 'a')).toBe(OWN_MOVE_MS);
    expect(beatDuration(dug, 'a')).toBe(TOAST_MS.dug);
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

  it('Market Mayhem: using a power (or dodging a dog) cheers the cat up for the round', () => {
    let moods = moodsWhenBeatStarts({}, { kind: 'power', playerId: 'a', power: 'haggle' });
    expect(moods).toEqual({ a: 'happy' });
    moods = moodsWhenBeatStarts(moods, { kind: 'slept', playerId: 'b' });
    expect(moodsWhenBeatEnds(moods)).toEqual({ a: 'happy', b: 'happy' });
  });

  it('Market Mayhem: events and powers are announced; small gains are toasts', () => {
    const [event] = toBeats([{ type: 'EVENT_REVEALED', round: 2, event: 'blackout' }]);
    expect(event).toEqual({ kind: 'event', round: 2, event: 'blackout' });
    expect(isBlocking(event!, null)).toBe(true);
    const [gift] = toBeats([{ type: 'VENDOR_GIFT', playerId: 'a', card: fish }]);
    expect(isBlocking(gift!, null)).toBe(false);
    const [power] = toBeats([{ type: 'POWER_USED', playerId: 'a', power: 'goodLuck' }]);
    expect(isBlocking(power!, null)).toBe(true);
    expect(beatDuration(event!)).toBeGreaterThanOrEqual(POPUP_MIN_MS);
  });
});
