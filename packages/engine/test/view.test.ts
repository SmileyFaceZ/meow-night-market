import { describe, expect, it } from 'vitest';
import type { GameState } from '../src/types.ts';
import { getPlayerView } from '../src/view.ts';
import { act, newGame, patchPlayer, playRandomGame, reachableCardIds } from './helpers.ts';

/** Card ids a given seat is allowed to see (GAME_RULES §8). */
function allowedIds(s: GameState, viewer: string | null): Set<number> {
  const me = s.players.find((p) => p.id === viewer);
  return new Set(
    [
      ...(me?.hand ?? []),
      ...s.market,
      ...s.bag,
      ...s.discard,
      ...(s.pendingDog ? [s.pendingDog] : []),
      ...s.players.flatMap((p) => p.meals.flatMap((m) => m.cards)),
      ...s.players.flatMap((p) => p.picks), // public pick history
    ].map((c) => c.id),
  );
}

describe('§8 open and hidden information — getPlayerView', () => {
  it('never shows another player’s hand or any deck order, at any point of many games', () => {
    for (let seed = 0; seed < 40; seed++) {
      playRandomGame(seed, 2 + (seed % 3), (state) => {
        for (const viewer of [...state.players.map((p) => p.id), null]) {
          const view = getPlayerView(state, viewer);
          const allowed = allowedIds(state, viewer);
          for (const id of reachableCardIds(view)) expect(allowed.has(id)).toBe(true);
        }
      });
    }
  });

  it('does not leak the raw state (rng, decks, secret bids/discards)', () => {
    const view = getPlayerView(newGame(3), 'a') as unknown as Record<string, unknown>;
    for (const key of [
      'rng',
      'trashDeck',
      'marketDeck',
      'bids',
      'pendingDiscards',
      'firstStartSeat',
    ]) {
      expect(view).not.toHaveProperty(key);
    }
  });

  it('keeps bids secret until everyone has chosen; shows who has chosen', () => {
    const s = act(newGame(3), { type: 'bid', playerId: 'a', value: 4 }).state;
    const theirs = getPlayerView(s, 'b');
    expect(theirs.players[0]).toMatchObject({ hasBid: true, revealedBid: null });
    expect(theirs.players[1]).toMatchObject({ hasBid: false });
    expect(theirs.yourBid).toBeNull();
    expect(theirs.players[0]!.meowLeft).toEqual([1, 2, 3, 4, 5]); // meow card not removed until reveal
    expect(getPlayerView(s, 'a').yourBid).toBe(4);
  });

  it('shows revealed bids, remaining meow numbers and clashes after the reveal', () => {
    let s = newGame(3);
    for (const [id, value] of [
      ['a', 2],
      ['b', 2],
      ['c', 5],
    ] as const) {
      s = act(s, { type: 'bid', playerId: id, value }).state;
    }
    const view = getPlayerView(s, 'c');
    expect(view.players.map((p) => p.revealedBid)).toEqual([2, 2, 5]);
    expect(view.players.map((p) => p.clashed)).toEqual([true, true, false]);
    expect(view.players[0]!.meowLeft).toEqual([1, 3, 4, 5]);
  });

  it('shows public counts and piles', () => {
    const s = newGame(4);
    const view = getPlayerView(s, 'a');
    expect(view.market).toEqual(s.market);
    expect(view.marketDeckCount).toBe(s.marketDeck.length);
    expect(view.trashCount).toBe(s.trashDeck.length);
    expect(view.trashDogCount).toBe(4);
    expect(view.discard).toEqual([]);
    expect(view.prices).toEqual(s.prices);
    expect(view.players.map((p) => p.handCount)).toEqual([0, 0, 0, 0]);
    expect(view.round).toBe(1);
  });

  it('shows everyone’s bone count and market picks', () => {
    let s = act(newGame(3), { type: 'bid', playerId: 'a', value: 5 }).state;
    s = act(s, { type: 'bid', playerId: 'b', value: 1 }).state;
    s = act(s, { type: 'bid', playerId: 'c', value: 1 }).state;
    const picked = s.market[0]!;
    s = act(s, { type: 'pick', playerId: 'a', cardId: picked.id }).state;
    const bone = { id: 9001, kind: 'bone' as const };
    s = patchPlayer(s, 'b', {
      hand: [bone, { id: 9002, kind: 'fish' }, { id: 9003, kind: 'bone' }],
    });
    const view = getPlayerView(s, 'c');
    expect(view.players.map((p) => p.boneCount)).toEqual([0, 2, 0]);
    expect(view.players[0]!.picks).toEqual([picked]);
    expect(view.players[1]!.picks).toEqual([]);
  });

  it('gives your own hand to you and nothing to a spectator', () => {
    const { final } = playRandomGame('hands', 3);
    expect(getPlayerView(final, 'b').hand).toEqual(final.players[1]!.hand);
    const spectator = getPlayerView(final, null);
    expect(spectator.hand).toEqual([]);
    expect(spectator.yourBid).toBeNull();
    expect(() => getPlayerView(final, 'nobody')).toThrow();
  });
});
