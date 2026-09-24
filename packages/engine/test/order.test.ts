import { describe, expect, it } from 'vitest';
import { computeTurnOrder } from '../src/rules.ts';
import { createGame } from '../src/setup.ts';
import type { GameState } from '../src/types.ts';
import { getPlayerView } from '../src/view.ts';
import { bidAll, finishFeast, newGame, P, patch, pickAll, stopAll } from './helpers.ts';

/** Play a round out with trivial moves (everyone bids its lowest number). */
function finishRound(s: GameState): GameState {
  s = bidAll(s, Object.fromEntries(s.players.map((p) => [p.id, Math.min(...p.meowLeft)]))).state;
  s = pickAll(s).state;
  s = stopAll(s).state;
  return finishFeast(s).state;
}

describe('§4.1 tie-break order', () => {
  it('is drawn with the seeded RNG at the start of every round, as a permutation of all players', () => {
    const s = newGame(4, 'ties');
    expect([...s.tieOrder].sort()).toEqual([...P]);
    expect(newGame(4, 'ties').tieOrder).toEqual(s.tieOrder);
    const orders = new Set<string>();
    for (let seed = 0; seed < 30; seed++) orders.add(newGame(4, seed).tieOrder.join(''));
    expect(orders.size).toBeGreaterThan(10);
  });

  it('is public before anyone bids (view and ROUND_STARTED event)', () => {
    const s = newGame(3);
    expect(getPlayerView(s, 'b').tieOrder).toEqual(s.tieOrder);
    const next = finishRound(s);
    expect(next.round).toBe(2);
    expect(getPlayerView(next, 'c').tieOrder).toEqual(next.tieOrder);
  });

  it('is redrawn each round', () => {
    let s = createGame({ playerIds: P, seed: 'redraw' });
    const orders: string[] = [];
    while (s.round <= 3 && s.phase !== 'gameOver') {
      orders.push(s.tieOrder.join(''));
      s = finishRound(s);
    }
    expect(new Set(orders).size).toBeGreaterThan(1);
  });
});

describe('§5/§6 turn order for Trash Dig and Feast Time', () => {
  it('orders everyone by bid, lowest first — clashed players included', () => {
    const s = bidAll(patch(newGame(4), { tieOrder: ['a', 'b', 'c', 'd'] }), {
      a: 5,
      b: 3,
      c: 3,
      d: 1,
    }).state;
    expect(s.turnOrder).toEqual(['d', 'b', 'c', 'a']);
  });

  it('breaks ties with the round’s tie-break order, not with seats', () => {
    const s = bidAll(patch(newGame(4), { tieOrder: ['c', 'a', 'd', 'b'] }), {
      a: 2,
      b: 2,
      c: 4,
      d: 2,
    }).state;
    expect(s.turnOrder).toEqual(['a', 'd', 'b', 'c']);
    expect(computeTurnOrder(s.players, { a: 1, b: 1, c: 1, d: 1 }, ['d', 'b', 'a', 'c'])).toEqual([
      'd',
      'b',
      'a',
      'c',
    ]);
  });

  it('eat phase uses the same order as the trash phase', () => {
    let s = bidAll(patch(newGame(3), { tieOrder: ['a', 'b', 'c'] }), { a: 3, b: 3, c: 1 }).state;
    const order = [...s.turnOrder];
    s = pickAll(s).state;
    s = patch(s, {
      players: s.players.map((p) => ({
        ...p,
        hand: [0, 1, 2].map((i) => ({ id: 5000 + p.seat * 10 + i, kind: 'milk' as const })),
      })),
    });
    const r = stopAll(s);
    expect(r.state.phase).toBe('eat');
    expect(r.state.turnOrder).toEqual(order);
    expect(r.state.turnOrder[r.state.turnIndex]).toBe('c');
  });
});
