// Experimental balance levers (config only, not in GAME_RULES.md yet).
// The official rules are the defaults; these tests make sure the simulated options behave as described.
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, type GameConfig } from '../src/config.ts';
import { createGame } from '../src/setup.ts';
import { act, bidAll, cards, patch, player } from './helpers.ts';

const game = (config: Partial<GameConfig>) =>
  createGame({ playerIds: ['a', 'b', 'c'], seed: 'exp', config: { ...DEFAULT_CONFIG, ...config } });

describe('experimental balance levers', () => {
  it('defaults reproduce the official rules', () => {
    expect(DEFAULT_CONFIG).toMatchObject({
      leftoverMarketToTrash: false,
      clashConsolationDraws: 0,
      clashedPickLast: false,
      recycleDiscardEachRound: false,
      clashTieBreak: 'seat',
      dogCopies: 4,
      marketExtra: 1,
    });
    expect(DEFAULT_CONFIG.foodTypes).toHaveLength(5);
  });

  it('A: leftover stall cards are shuffled into the bin', () => {
    const s = game({ leftoverMarketToTrash: true });
    const market = [...s.market];
    const r = bidAll(s, { a: 2, b: 2, c: 2 });
    expect(r.state.discard).toEqual([]);
    for (const c of market) expect(r.state.trashDeck).toContainEqual(c);
    expect(r.events).toContainEqual({ type: 'MARKET_CLEARED', cards: market, to: 'trash' });
  });

  it('B: each clashed player draws one free card from the bin; a dog costs nothing', () => {
    let s = game({ clashConsolationDraws: 1 });
    const [fish, dog] = cards('fish', 'dog');
    s = patch(s, { trashDeck: [fish!, dog!, ...cards('milk', 'milk')] });
    const r = bidAll(s, { a: 3, b: 3, c: 1 });
    const order = r.state.turnOrder.filter((id) => id !== 'c');
    expect(player(r.state, order[0]!).hand).toEqual([fish]);
    expect(player(r.state, order[1]!).hand).toEqual([]);
    expect(r.state.trashDeck).toContainEqual(dog);
    expect(player(r.state, 'c').hand).toEqual([]); // not clashed → no free draw
  });

  it('D: the discard pile is shuffled into the bin when digging starts', () => {
    let s = game({ recycleDiscardEachRound: true });
    const pile = cards('fish', 'milk');
    s = patch(s, { discard: pile });
    const r = bidAll(s, { a: 2, b: 2, c: 2 }); // everyone clashes → market also discarded → recycled
    expect(r.state.phase).toBe('trash');
    expect(r.state.discard).toEqual([]);
    for (const c of pile) expect(r.state.trashDeck).toContainEqual(c);
  });

  it('E: clashed players still pick, after the unique bidders, in turn order', () => {
    const s = game({ clashedPickLast: true });
    const r = bidAll(s, { a: 4, b: 4, c: 1 });
    expect(r.state.pickQueue[0]).toBe('c');
    expect([...r.state.pickQueue.slice(1)].sort()).toEqual(['a', 'b']);
    let t = r.state;
    while (t.phase === 'pick')
      t = act(t, { type: 'pick', playerId: t.pickQueue[0]!, cardId: t.market[0]!.id }).state;
    for (const id of ['a', 'b', 'c']) expect(player(t, id).hand).toHaveLength(1);
  });

  it('T: equal bids go lowest score first, then seat order', () => {
    let s = patch(game({ clashTieBreak: 'lowestScore' }), { firstStartSeat: 0 });
    const meal = { round: 1, food: 'fish' as const, cards: [], big: false, price: 5, points: 5 };
    s = { ...s, players: s.players.map((p) => (p.id === 'a' ? { ...p, meals: [meal] } : p)) };
    expect(bidAll(s, { a: 2, b: 2, c: 2 }).state.turnOrder).toEqual(['b', 'c', 'a']);
  });

  it('R: equal bids are ordered by a seeded shuffle that changes between games', () => {
    const orders = new Set<string>();
    for (let seed = 0; seed < 20; seed++) {
      const s = createGame({
        playerIds: ['a', 'b', 'c'],
        seed,
        config: { ...DEFAULT_CONFIG, clashTieBreak: 'random' },
      });
      orders.add(bidAll(s, { a: 2, b: 2, c: 2 }).state.turnOrder.join(''));
    }
    expect(orders.size).toBeGreaterThan(3);
  });

  it('G: a deck with fewer food types', () => {
    const s = game({ foodTypes: ['fish', 'chicken', 'shrimp', 'milk'], foodCopies: 10 });
    const all = [...s.marketDeck, ...s.market, ...s.trashDeck];
    expect(all.filter((c) => c.kind === 'snack')).toEqual([]);
    expect(all.filter((c) => c.kind === 'fish')).toHaveLength(10);
  });
});
