// Experimental balance levers under study (NOT in GAME_RULES.md yet). Defaults = official rules.
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config.ts';
import { createGame } from '../src/setup.ts';
import { finishFeast, P, patch, pickAll, playRandomGame, stopAll, bidAll } from './helpers.ts';

describe('M: more meow numbers than rounds', () => {
  const config = { ...DEFAULT_CONFIG, meowValues: [1, 2, 3, 4, 5, 6, 7] };

  it('gives everyone the longer range; games still last 5 rounds and leave 2 numbers unused', () => {
    const s = createGame({ playerIds: P, seed: 'm', config });
    expect(s.players[0]!.meowLeft).toEqual([1, 2, 3, 4, 5, 6, 7]);
    let t = bidAll(s, { a: 7, b: 6, c: 6, d: 1 }).state;
    expect(t.players[0]!.meowLeft).toEqual([1, 2, 3, 4, 5, 6]);
    t = finishFeast(stopAll(pickAll(t).state).state).state;
    expect(t.round).toBe(2);
  });

  it('plays whole random games to the end with every range size', () => {
    for (const top of [5, 6, 7]) {
      const meowValues = Array.from({ length: top }, (_, k) => k + 1);
      const { final } = playRandomGame(`m${top}`, 4, undefined, { ...DEFAULT_CONFIG, meowValues });
      expect(final.phase).toBe('gameOver');
      for (const p of final.players) expect(p.meowLeft).toHaveLength(top - 5);
    }
    expect(() =>
      createGame({ playerIds: P, seed: 1, config: { ...config, meowValues: [1, 2] } }),
    ).toThrow();
  });
});

describe('S: tie-break order by lowest score from round 2', () => {
  it('round 1 is random; later rounds put the lowest score first (random draw breaks ties)', () => {
    let s = createGame({
      playerIds: ['a', 'b', 'c'],
      seed: 's',
      config: { ...DEFAULT_CONFIG, tieOrderByScore: true },
    });
    const meal = { round: 1, food: 'fish' as const, cards: [], big: false, price: 5, points: 5 };
    s = patch(s, {
      players: s.players.map((p) =>
        p.id === 'a' ? { ...p, meals: [meal, meal] } : p.id === 'b' ? { ...p, meals: [meal] } : p,
      ),
    });
    s = finishFeast(stopAll(pickAll(bidAll(s, { a: 1, b: 2, c: 3 }).state).state).state).state;
    expect(s.round).toBe(2);
    expect(s.tieOrder).toEqual(['c', 'b', 'a']);
  });

  it('is off by default', () => {
    expect(DEFAULT_CONFIG.tieOrderByScore).toBe(false);
  });
});

describe('X: equal bids pick in tie-break order but dig (and/or eat) in reverse', () => {
  const tie = ['a', 'b', 'c'];
  const reach = (tieReverse: 'none' | 'trash' | 'eat' | 'trashAndEat') => {
    const s = patch(
      createGame({ playerIds: tie, seed: 'x', config: { ...DEFAULT_CONFIG, tieReverse } }),
      { tieOrder: tie },
    );
    return bidAll(s, { a: 2, b: 2, c: 2 }).state;
  };

  it('picking always follows the tie-break order', () => {
    for (const mode of ['none', 'trash', 'eat', 'trashAndEat'] as const) {
      expect(reach(mode).pickQueue).toEqual(tie);
    }
  });

  it("'trash' reverses the dig order only; Feast Time is back to the tie-break order", () => {
    const s = pickAll(reach('trash')).state;
    expect(s.turnOrder).toEqual(['c', 'b', 'a']);
    const three = (id: string) =>
      [0, 1, 2].map((i) => ({ id: 7000 + id.charCodeAt(0) * 10 + i, kind: 'milk' as const }));
    const withMeals = patch(s, { players: s.players.map((p) => ({ ...p, hand: three(p.id) })) });
    expect(stopAll(withMeals).state.turnOrder).toEqual(tie);
  });

  it('is off by default', () => {
    expect(DEFAULT_CONFIG.tieReverse).toBe('none');
  });
});
