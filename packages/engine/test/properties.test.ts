import { describe, expect, it } from 'vitest';
import { applyAction } from '../src/actions.ts';
import { totalCardCount } from '../src/cards.ts';
import { DEFAULT_CONFIG, FOOD_TYPES } from '../src/config.ts';
import type { GameState } from '../src/types.ts';
import { allCardIds, newGame, playRandomGame } from './helpers.ts';

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const child of Object.values(value)) deepFreeze(child);
  }
  return value;
}

function checkInvariants(s: GameState): void {
  const ids = allCardIds(s);
  expect(ids.length).toBe(totalCardCount(s.config));
  expect(new Set(ids).size).toBe(ids.length);

  for (const food of FOOD_TYPES) {
    expect(s.prices[food]).toBeGreaterThanOrEqual(s.config.minPrice);
    expect(s.prices[food]).toBeLessThanOrEqual(s.config.startPrice);
  }
  // Dogs live only in the bin (or are momentarily waiting for a bone decision).
  const dogsOutside = [
    ...s.market,
    ...s.discard,
    ...s.bag,
    ...s.players.flatMap((p) => [...p.hand, ...p.meals.flatMap((m) => m.cards)]),
  ].filter((c) => c.kind === 'dog');
  expect(dogsOutside).toEqual([]);
  // At the start of a round every hand is within the limit.
  if (s.phase === 'bidding') {
    for (const p of s.players) expect(p.hand.length).toBeLessThanOrEqual(s.config.handLimit);
    expect(s.players.every((p) => p.meowLeft.length === s.config.rounds - s.round + 1)).toBe(true);
  }
}

describe('property: 1,000 random games', () => {
  it('never error, keep every card, always finish after 5 rounds', { timeout: 120_000 }, () => {
    for (let seed = 0; seed < 1000; seed++) {
      const players = 2 + (seed % 3);
      const { final } = playRandomGame(seed, players, (state) => checkInvariants(state));
      expect(final.phase).toBe('gameOver');
      expect(final.round).toBe(DEFAULT_CONFIG.rounds);
      expect(final.marketDeck).toEqual([]);
      for (const p of final.players) expect(p.meowLeft).toEqual([]);
      expect(final.result!.winners.length).toBeGreaterThan(0);
      expect(final.result!.scores).toHaveLength(players);
    }
  });
});

describe('determinism', () => {
  it('same seed + same actions = same state, event for event', () => {
    for (const seed of ['alpha', 'beta', 7, 2026]) {
      const log: unknown[] = [];
      const { final, actions } = playRandomGame(seed, 4, (state, _action, events) =>
        log.push(state, events),
      );
      let state = newGame(4, seed);
      const replay: unknown[] = [];
      for (const action of actions) {
        const result = applyAction(state, action);
        if (!result.ok) throw new Error(result.error);
        state = result.state;
        replay.push(state, result.events);
      }
      expect(state).toEqual(final);
      expect(replay).toEqual(log);
    }
  });

  it('different seeds give different games', () => {
    expect(playRandomGame(1, 3).final).not.toEqual(playRandomGame(2, 3).final);
  });

  it('game state survives a JSON round trip (save / network)', () => {
    playRandomGame('json', 3, (state) => {
      expect(JSON.parse(JSON.stringify(state))).toEqual(state);
    });
  });
});

describe('immutability', () => {
  it('applyAction never mutates its input state', () => {
    let steps = 0;
    playRandomGame('frozen', 3, () => steps++);
    // replay with every intermediate state deep-frozen: any mutation would throw
    const { actions } = playRandomGame('frozen', 3);
    let state = deepFreeze(newGame(3, 'frozen'));
    for (const action of actions) {
      const result = applyAction(state, action);
      if (!result.ok) throw new Error(result.error);
      state = deepFreeze(result.state);
    }
    expect(state.phase).toBe('gameOver');
    expect(steps).toBe(actions.length);
  });

  it('rejected actions return an error and no state', () => {
    const s = newGame(3);
    const result = applyAction(s, { type: 'dig', playerId: 'a' });
    expect(result).toEqual({ ok: false, error: 'error.wrongPhase' });
  });

  it('nothing is accepted after the game is over', () => {
    const { final } = playRandomGame('over', 2);
    expect(applyAction(final, { type: 'bid', playerId: 'a', value: 1 })).toEqual({
      ok: false,
      error: 'error.gameOver',
    });
  });
});
