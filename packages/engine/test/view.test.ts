import { describe, expect, it } from 'vitest';
import type { GameState } from '../src/types.ts';
import { getPlayerView } from '../src/view.ts';
import { act, newGame, patchPlayer, playRandomGame, reachableCardIds } from './helpers.ts';

/** Card ids anyone may see (GAME_RULES §8): everything except the two decks. */
function allowedIds(s: GameState): Set<number> {
  return new Set(
    [
      ...s.players.flatMap((p) => p.hand), // hands are open
      ...s.market,
      ...s.bag,
      ...s.discard,
      ...(s.pendingDog ? [s.pendingDog] : []),
      ...s.players.flatMap((p) => p.meals.flatMap((m) => m.cards)),
    ].map((c) => c.id),
  );
}

describe('§8 open and hidden information — getPlayerView', () => {
  it('never shows the order or contents of the market deck or the bin, at any point of many games', () => {
    for (let seed = 0; seed < 40; seed++) {
      playRandomGame(seed, 2 + (seed % 3), (state) => {
        for (const viewer of [...state.players.map((p) => p.id), null]) {
          const view = getPlayerView(state, viewer);
          const allowed = allowedIds(state);
          for (const id of reachableCardIds(view)) expect(allowed.has(id)).toBe(true);
        }
      });
    }
  });

  it('does not leak the raw state (rng, decks, secret bids/discards)', () => {
    const view = getPlayerView(newGame(3), 'a') as unknown as Record<string, unknown>;
    for (const key of ['rng', 'trashDeck', 'marketDeck', 'bids', 'pendingDiscards']) {
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

  it('shows every player’s hand (hands are open information)', () => {
    let s = newGame(3);
    const bHand = [
      { id: 9001, kind: 'bone' as const },
      { id: 9002, kind: 'fish' as const },
    ];
    s = patchPlayer(s, 'b', { hand: bHand });
    for (const viewer of ['a', 'c', null]) {
      const view = getPlayerView(s, viewer);
      expect(view.players[1]!.hand).toEqual(bHand);
      expect(view.players[1]!.handCount).toBe(2);
    }
  });

  it('gives your own hand as `hand`; a spectator has none but still sees every player’s', () => {
    const { final } = playRandomGame('hands', 3);
    expect(getPlayerView(final, 'b').hand).toEqual(final.players[1]!.hand);
    const spectator = getPlayerView(final, null);
    expect(spectator.hand).toEqual([]);
    expect(spectator.players.map((p) => p.hand)).toEqual(final.players.map((p) => p.hand));
    expect(spectator.yourBid).toBeNull();
    expect(() => getPlayerView(final, 'nobody')).toThrow();
  });
});
