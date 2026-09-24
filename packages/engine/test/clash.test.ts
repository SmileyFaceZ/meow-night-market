// GAME_RULES §4.5–4.6 (clashed players pick last and draw a free card) and §5 (bin recycling).
import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG } from '../src/config.ts';
import { act, bidAll, cards, eventTypes, newGame, patch, pickAll, player } from './helpers.ts';

describe('§4.5 clashed players still pick — after everyone who did not clash', () => {
  it('queues unique bidders (high → low) first, then the clashed in turn order', () => {
    const s = bidAll(patch(newGame(4), { tieOrder: ['d', 'c', 'b', 'a'] }), {
      a: 4,
      b: 4,
      c: 1,
      d: 5,
    }).state;
    expect(s.clashed).toEqual(['a', 'b']);
    expect(s.pickQueue).toEqual(['d', 'c', 'b', 'a']);
  });

  it('with the stall at players + 1 cards everyone gets exactly one pick', () => {
    const s = newGame(3);
    const r = pickAll(bidAll(s, { a: 2, b: 2, c: 2 }).state);
    for (const id of ['a', 'b', 'c']) {
      expect(r.events.filter((e) => e.type === 'CARD_PICKED' && e.playerId === id)).toHaveLength(1);
    }
    expect(r.events).toContainEqual(expect.objectContaining({ type: 'MARKET_CLEARED' }));
  });
});

describe('§4.6 clash consolation: one free card from the bin', () => {
  it('each clashed player draws one card into the hand after picking, in turn order', () => {
    let s = patch(newGame(3), { tieOrder: ['a', 'b', 'c'] });
    const [fish, milk] = cards('fish', 'milk');
    s = patch(s, { trashDeck: [fish!, milk!, ...cards('snack', 'snack')] });
    s = bidAll(s, { a: 3, b: 3, c: 1 }).state;
    const r = pickAll(s);
    expect(r.events.filter((e) => e.type === 'CLASH_DRAW')).toEqual([
      { type: 'CLASH_DRAW', playerId: 'a', card: fish },
      { type: 'CLASH_DRAW', playerId: 'b', card: milk },
    ]);
    expect(player(r.state, 'a').hand).toContainEqual(fish);
    expect(player(r.state, 'c').hand).toHaveLength(1); // no clash → pick only
    // draws come after the last pick
    const types = eventTypes(r.events);
    expect(types.lastIndexOf('CARD_PICKED')).toBeLessThan(types.indexOf('CLASH_DRAW'));
  });

  it('a dog costs nothing: it goes straight back into the bin', () => {
    let s = patch(newGame(3), { tieOrder: ['a', 'b', 'c'] });
    const [dog] = cards('dog');
    s = patch(s, { trashDeck: [dog!, ...cards('fish', 'milk')] });
    const r = pickAll(bidAll(s, { a: 3, b: 3, c: 1 }).state);
    expect(r.events).toContainEqual({ type: 'CLASH_DRAW', playerId: 'a', card: dog });
    expect(player(r.state, 'a').hand).toHaveLength(1); // only the stall pick
    expect(r.state.trashDeck).toContainEqual(dog);
  });

  it('the number of free cards comes from config (CLASH_FREE_DRAWS)', () => {
    expect(DEFAULT_CONFIG.clashFreeDraws).toBe(1);
    const s = patch(newGame(3), { config: { ...DEFAULT_CONFIG, clashFreeDraws: 0 } });
    const r = pickAll(bidAll(s, { a: 2, b: 2, c: 2 }).state);
    expect(eventTypes(r.events)).not.toContain('CLASH_DRAW');
  });

  it('nothing is drawn when the bin cannot be dug (only dogs, empty discard pile)', () => {
    let s = patch(newGame(3), { trashDeck: cards('dog', 'dog'), discard: [] });
    s = bidAll(s, { a: 2, b: 2, c: 5 }).state;
    // stall leftovers only reach the discard pile after the draws
    const r = pickAll(s);
    expect(eventTypes(r.events)).not.toContain('CLASH_DRAW');
  });
});

describe('§5 the discard pile is shuffled back into the bin when digging starts', () => {
  it('including this round’s stall leftovers', () => {
    let s = patch(newGame(3), { discard: cards('fish', 'bone') });
    const before = [...s.discard];
    s = bidAll(s, { a: 1, b: 2, c: 3 }).state;
    const leftover = s.market.at(-1)!;
    let r = act(s, { type: 'pick', playerId: 'c', cardId: s.market[0]!.id });
    r = act(r.state, { type: 'pick', playerId: 'b', cardId: r.state.market[0]!.id });
    r = act(r.state, { type: 'pick', playerId: 'a', cardId: r.state.market[0]!.id });
    expect(r.state.phase).toBe('trash');
    expect(r.state.discard).toEqual([]);
    for (const c of [...before, leftover]) expect(r.state.trashDeck).toContainEqual(c);
    expect(r.events).toContainEqual({ type: 'TRASH_RESHUFFLED', count: 3 });
  });
});
