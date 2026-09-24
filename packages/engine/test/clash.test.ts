// GAME_RULES §4.5 (clashed players pick after the others) and §5 (bin recycling).
import { describe, expect, it } from 'vitest';
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

describe('§4.5 clashing is never better than not clashing', () => {
  it('clashed players get exactly one stall card and nothing else', () => {
    const s = patch(newGame(3), { tieOrder: ['a', 'b', 'c'] });
    const r = pickAll(bidAll(s, { a: 3, b: 3, c: 1 }).state);
    for (const id of ['a', 'b', 'c']) expect(player(r.state, id).hand).toHaveLength(1);
    expect(eventTypes(r.events).filter((t) => t === 'CARD_PICKED')).toHaveLength(3);
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
