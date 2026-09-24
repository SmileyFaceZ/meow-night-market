// GAME_RULES §4.1 (tie-break order: random in round 1, lowest score first afterwards)
// and §5 (equal bids dig in reverse tie-break order).
import { describe, expect, it } from 'vitest';
import { createGame } from '../src/setup.ts';
import type { Card } from '../src/types.ts';
import { bidAll, finishFeast, patch, pickAll, stopAll } from './helpers.ts';

const meal = { round: 1, food: 'fish' as const, cards: [], big: false, price: 5, points: 5 };

describe('§4.1 tie-break order from round 2: lowest score first', () => {
  it('sorts by score; the random draw of the round breaks equal scores', () => {
    let s = createGame({ playerIds: ['a', 'b', 'c'], seed: 's' });
    s = patch(s, {
      players: s.players.map((p) =>
        p.id === 'a' ? { ...p, meals: [meal, meal] } : p.id === 'b' ? { ...p, meals: [meal] } : p,
      ),
    });
    s = finishFeast(stopAll(pickAll(bidAll(s, { a: 1, b: 2, c: 3 }).state).state).state).state;
    expect(s.round).toBe(2);
    expect(s.tieOrder).toEqual(['c', 'b', 'a']);
  });

  it('round 1 is a pure random draw', () => {
    const orders = new Set<string>();
    for (let seed = 0; seed < 20; seed++) {
      orders.add(createGame({ playerIds: ['a', 'b', 'c'], seed }).tieOrder.join(''));
    }
    expect(orders.size).toBeGreaterThan(3);
  });
});

describe('§5 equal bids pick in tie-break order but dig in reverse', () => {
  const tie = ['a', 'b', 'c'];
  const revealed = () =>
    bidAll(patch(createGame({ playerIds: tie, seed: 'x' }), { tieOrder: tie }), {
      a: 2,
      b: 2,
      c: 2,
    }).state;

  it('picks follow the tie-break order', () => {
    expect(revealed().pickQueue).toEqual(tie);
  });

  it('digging goes in reverse; Feast Time goes back to the tie-break order', () => {
    const s = pickAll(revealed()).state;
    expect(s.phase).toBe('trash');
    expect(s.turnOrder).toEqual(['c', 'b', 'a']);
    const three = (seat: number): Card[] =>
      [0, 1, 2].map((i) => ({ id: 7000 + seat * 10 + i, kind: 'milk' }));
    const withMeals = patch(s, { players: s.players.map((p) => ({ ...p, hand: three(p.seat) })) });
    expect(stopAll(withMeals).state.turnOrder).toEqual(tie);
  });

  it('lower bids still dig first — only equal bids are reversed', () => {
    const s = bidAll(
      patch(createGame({ playerIds: ['a', 'b', 'c', 'd'], seed: 'y' }), {
        tieOrder: ['a', 'b', 'c', 'd'],
      }),
      { a: 3, b: 3, c: 1, d: 5 },
    ).state;
    expect(s.turnOrder).toEqual(['c', 'b', 'a', 'd']);
  });
});
