import { describe, expect, it } from 'vitest';
import {
  act,
  bidAll,
  eventTypes,
  expectError,
  finishFeast,
  newGame,
  pickAll,
  player,
  stopAll,
} from './helpers.ts';

describe('§4 Stall Scramble (simultaneous bidding)', () => {
  it('reveals nothing until everyone has bid, then reveals all at once', () => {
    let s = newGame(3);
    let r = act(s, { type: 'bid', playerId: 'a', value: 3 });
    expect(eventTypes(r.events)).toEqual(['BID_PLACED']);
    expect(r.events[0]).toEqual({ type: 'BID_PLACED', playerId: 'a' }); // no value leaked
    s = r.state;
    expect(s.phase).toBe('bidding');
    s = act(s, { type: 'bid', playerId: 'b', value: 2 }).state;
    r = act(s, { type: 'bid', playerId: 'c', value: 5 });
    expect(r.events).toContainEqual({ type: 'BIDS_REVEALED', bids: { a: 3, b: 2, c: 5 } });
    expect(r.state.phase).toBe('pick');
  });

  it('a player may bid only once per round', () => {
    const s = act(newGame(3), { type: 'bid', playerId: 'a', value: 3 }).state;
    expectError(s, { type: 'bid', playerId: 'a', value: 4 }, 'error.alreadyBid');
  });

  it('can only bid a meow card that is still unused', () => {
    expectError(newGame(3), { type: 'bid', playerId: 'a', value: 6 }, 'error.meowUsed');
    // round 1: a uses 5 → next round 5 is gone
    let s = bidAll(newGame(3), { a: 5, b: 1, c: 1 }).state;
    expect(player(s, 'a').meowLeft).toEqual([1, 2, 3, 4]);
    expect(player(s, 'b').meowLeft).toEqual([2, 3, 4, 5]);
    // finish round 1 quickly
    s = finishFeast(stopAll(pickAll(s).state).state).state;
    expect(s.round).toBe(2);
    expectError(s, { type: 'bid', playerId: 'a', value: 5 }, 'error.meowUsed');
  });

  it('players who bid the same number clash and pick after everyone else', () => {
    const r = bidAll(newGame(4), { a: 4, b: 4, c: 2, d: 1 });
    expect(r.events).toContainEqual({ type: 'BID_CLASH', value: 4, playerIds: ['a', 'b'] });
    expect(r.state.clashed).toEqual(['a', 'b']);
    expect(r.state.pickQueue.slice(0, 2)).toEqual(['c', 'd']);
    expect([...r.state.pickQueue.slice(2)].sort()).toEqual(['a', 'b']);
  });

  it('clashed players still use up their meow card', () => {
    const s = bidAll(newGame(3), { a: 4, b: 4, c: 1 }).state;
    expect(player(s, 'a').meowLeft).not.toContain(4);
    expect(player(s, 'b').meowLeft).not.toContain(4);
  });

  it('unique bidders pick one card each, highest bid first, into their hand', () => {
    let s = bidAll(newGame(3), { a: 2, b: 5, c: 3 }).state;
    expect(s.pickQueue).toEqual(['b', 'c', 'a']);
    expectError(s, { type: 'pick', playerId: 'a', cardId: s.market[0]!.id }, 'error.notYourTurn');

    const first = s.market[1]!;
    s = act(s, { type: 'pick', playerId: 'b', cardId: first.id }).state;
    expect(player(s, 'b').hand).toEqual([first]);
    expect(s.market).not.toContainEqual(first);
    expectError(s, { type: 'pick', playerId: 'c', cardId: first.id }, 'error.cardNotInMarket');

    s = act(s, { type: 'pick', playerId: 'c', cardId: s.market[0]!.id }).state;
    const r = act(s, { type: 'pick', playerId: 'a', cardId: s.market[0]!.id });
    for (const id of ['a', 'b', 'c']) expect(player(r.state, id).hand).toHaveLength(1);
    expect(r.state.phase).toBe('trash');
  });

  it('leftover stall cards go to the discard pile', () => {
    let s = bidAll(newGame(3), { a: 2, b: 3, c: 5 }).state; // 3 picks from a stall of 4
    const leftover = s.market.at(-1)!;
    const r = pickAll(s);
    s = r.state;
    expect(s.market).toEqual([]);
    expect(r.events).toContainEqual({ type: 'MARKET_CLEARED', cards: [leftover] });
  });

  it('cannot bid outside the bidding phase', () => {
    const s = bidAll(newGame(3), { a: 1, b: 2, c: 3 }).state;
    expectError(s, { type: 'bid', playerId: 'a', value: 2 }, 'error.wrongPhase');
  });

  it('rejects actions from unknown players', () => {
    expectError(newGame(3), { type: 'bid', playerId: 'zzz', value: 1 }, 'error.unknownPlayer');
  });
});
