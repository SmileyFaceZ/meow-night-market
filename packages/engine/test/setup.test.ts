import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, FOOD_TYPES } from '../src/config.ts';
import { createRng, hashSeed } from '../src/rng.ts';
import { applyAction } from '../src/actions.ts';
import { chooseRandomAction } from '../src/bots/random.ts';
import { pendingActors } from '../src/rules.ts';
import { createGame, upgradeState } from '../src/setup.ts';
import type { GameState } from '../src/types.ts';
import { getPlayerView } from '../src/view.ts';
import { allCardIds, newGame, P } from './helpers.ts';

const count = (cards: readonly { kind: string }[], kind: string) =>
  cards.filter((c) => c.kind === kind).length;

describe('§1 overview', () => {
  it('allows 2–4 seats only', () => {
    expect(() => createGame({ playerIds: ['a'], seed: 1 })).toThrow();
    expect(() => createGame({ playerIds: [...P, 'e'], seed: 1 })).toThrow();
    for (const n of [2, 3, 4]) expect(newGame(n).players).toHaveLength(n);
  });

  it('rejects duplicate player ids', () => {
    expect(() => createGame({ playerIds: ['a', 'a'], seed: 1 })).toThrow();
  });

  it('plays 5 rounds and starts in round 1 bidding', () => {
    const s = newGame();
    expect(s.config.rounds).toBe(5);
    expect(s.round).toBe(1);
    expect(s.phase).toBe('bidding');
  });
});

describe('§2 cards', () => {
  it.each([
    [2, 8, 49],
    [3, 9, 54],
    [4, 10, 59],
  ])(
    '%i players: %i of each food, 2 goldfish, 3 bones, 4 dogs — %i unique cards',
    (n, food, total) => {
      const s = newGame(n);
      const every = [...s.marketDeck, ...s.market, ...s.trashDeck];
      for (const kind of FOOD_TYPES) expect(count(every, kind)).toBe(food);
      expect(count(every, 'goldfish')).toBe(2);
      expect(count(every, 'bone')).toBe(3);
      expect(count(every, 'dog')).toBe(4);
      expect(new Set(allCardIds(s)).size).toBe(total);
    },
  );

  it('gives every player meow cards 1–5', () => {
    for (const p of newGame(4).players) expect(p.meowLeft).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('§3 setup', () => {
  it.each([2, 3, 4])('market deck = rounds × (players + 1) for %i players', (n) => {
    const s = newGame(n);
    const marketSize = n + 1;
    expect(s.market).toHaveLength(marketSize);
    expect(s.marketDeck.length + s.market.length).toBe(5 * marketSize);
  });

  it.each([2, 3, 4])(
    'the bin starts with 27 food cards (+ 3 bones, 4 dogs) for %i players',
    (n) => {
      const s = newGame(n);
      const food = s.trashDeck.filter((c) => c.kind !== 'bone' && c.kind !== 'dog');
      expect(food).toHaveLength(27);
      expect(s.trashDeck).toHaveLength(34);
    },
  );

  it('market holds only food and goldfish; bones and dogs are only in the bin', () => {
    const s = newGame(4);
    const market = [...s.marketDeck, ...s.market];
    expect(count(market, 'bone') + count(market, 'dog')).toBe(0);
    expect(count(s.trashDeck, 'bone')).toBe(3);
    expect(count(s.trashDeck, 'dog')).toBe(4);
  });

  it('starts every food at price 5 (min 1)', () => {
    const s = newGame();
    for (const food of FOOD_TYPES) expect(s.prices[food]).toBe(5);
    expect(DEFAULT_CONFIG.startPrice).toBe(5);
    expect(DEFAULT_CONFIG.minPrice).toBe(1);
  });

  it('starts everyone with an empty hand', () => {
    for (const p of newGame().players) expect(p.hand).toEqual([]);
  });

  it('can fix the top of the market deck for scripted games (tutorial)', () => {
    const s = createGame({
      playerIds: ['a', 'b'],
      seed: 1,
      marketTop: ['fish', 'milk', 'chicken', 'shrimp'],
    });
    expect(s.market.map((c) => c.kind)).toEqual(['fish', 'milk', 'chicken']);
    expect(s.marketDeck[0]!.kind).toBe('shrimp');
    expect(new Set(allCardIds(s)).size).toBe(49);
    expect(() => createGame({ playerIds: ['a', 'b'], seed: 1, marketTop: ['bone'] })).toThrow();
  });

  it('same seed gives the same deal; a different seed a different one', () => {
    expect(newGame(3, 'x')).toEqual(newGame(3, 'x'));
    expect(newGame(3, 'x').trashDeck).not.toEqual(newGame(3, 'y').trashDeck);
  });
});

describe('seeded RNG', () => {
  it('is deterministic and resumable from its state', () => {
    const a = createRng(42);
    const b = createRng(42);
    const first = [a.next(), a.next(), a.next()];
    expect([b.next(), b.next(), b.next()]).toEqual(first);
    const resumed = createRng(a.state);
    expect(resumed.next()).toBe(a.next());
  });

  it('produces values in [0,1) and unbiased-looking ints', () => {
    const rng = createRng('dist');
    const buckets = [0, 0, 0, 0];
    for (let i = 0; i < 4000; i++) {
      const v = rng.next();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
      buckets[rng.int(4)]!++;
    }
    for (const b of buckets) expect(b).toBeGreaterThan(850);
  });

  it('hashes string seeds (e.g. a Bangkok date) to a stable number', () => {
    expect(hashSeed('2026-09-23')).toBe(hashSeed('2026-09-23'));
    expect(hashSeed('2026-09-23')).not.toBe(hashSeed('2026-09-24'));
  });

  it('shuffle is a permutation and does not mutate its input', () => {
    const input = [1, 2, 3, 4, 5, 6];
    const out = createRng(7).shuffle(input);
    expect(input).toEqual([1, 2, 3, 4, 5, 6]);
    expect([...out].sort()).toEqual(input);
  });
});

describe('upgradeState (older saves and rooms)', () => {
  it('fills fields added since, so an old game carries on as a classic game', () => {
    const fresh = createGame({ playerIds: ['a', 'b'], seed: 'old' });
    const old = JSON.parse(JSON.stringify(fresh)) as Record<string, unknown> & {
      config: Record<string, unknown>;
    };
    for (const key of ['powers', 'powerWindow', 'peek', 'digCount', 'extraOrder', 'events']) {
      delete old[key];
    }
    for (const key of ['setAsideDogs', 'faceDown', 'dogsSlept', 'passes']) delete old[key];
    delete old.config.events;

    let state = upgradeState(old as unknown as GameState);
    expect(state).toEqual(fresh);
    const rng = createRng(1);
    while (state.phase !== 'gameOver') {
      const actor = pendingActors(state)[0]!;
      const result = applyAction(state, chooseRandomAction(getPlayerView(state, actor), rng)!);
      if (!result.ok) throw new Error(result.error);
      state = result.state;
    }
  });
});
