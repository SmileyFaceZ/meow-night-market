import { describe, expect, it } from 'vitest';
import type { Card, CardKind } from '../src/types.ts';
import { getPlayerView } from '../src/view.ts';
import {
  act,
  cards,
  eventTypes,
  expectError,
  newGame,
  finishFeast,
  patch,
  player,
  skipToEat,
  skipToTrash,
  stopAll,
} from './helpers.ts';

const handOf = (n: number, kind: CardKind = 'fish') =>
  cards(...(Array(n).fill(kind) as CardKind[]));

/** Feast Time of round `round` where a has 12 cards and b has 11 (c has 10). */
function overLimit(round = 1) {
  const s = patch(skipToTrash(newGame(3)).state, { round });
  const hands: Record<string, Card[]> = {
    a: [...handOf(10, 'milk'), ...cards('bone', 'goldfish')],
    b: handOf(11, 'snack'),
    c: handOf(10, 'shrimp'),
  };
  return stopAll(patch(s, { players: s.players.map((p) => ({ ...p, hand: hands[p.id]! })) })).state;
}
const finishEating = finishFeast;

describe('§6 hand limit (end of Feast Time)', () => {
  it('players above 10 cards must discard down to 10 — bones and goldfish count', () => {
    const { state } = finishEating(overLimit());
    expect(state.phase).toBe('discard');
    expect(Object.keys(state.pendingDiscards).sort()).toEqual(['a', 'b']);
    const view = getPlayerView(state, 'c');
    expect(view.players.map((p) => p.mustDiscard)).toEqual([2, 1, 0]);
  });

  it('must discard exactly the excess, from your own hand', () => {
    const s = finishEating(overLimit()).state;
    const aHand = player(s, 'a').hand;
    expectError(
      s,
      { type: 'discard', playerId: 'a', cardIds: [aHand[0]!.id] },
      'error.wrongDiscardCount',
    );
    expectError(
      s,
      { type: 'discard', playerId: 'a', cardIds: [aHand[0]!.id, aHand[0]!.id] },
      'error.duplicateCard',
    );
    expectError(
      s,
      { type: 'discard', playerId: 'a', cardIds: [aHand[0]!.id, 424242] },
      'error.cardNotInHand',
    );
    expectError(s, { type: 'discard', playerId: 'c', cardIds: [] }, 'error.noDiscardNeeded');
  });

  it('choices are secret and simultaneous, then revealed together into the public discard pile', () => {
    let s = finishEating(overLimit()).state;
    const aThrow = player(s, 'a').hand.slice(-2); // bone + goldfish
    const bThrow = player(s, 'b').hand.slice(0, 1);

    const first = act(s, { type: 'discard', playerId: 'a', cardIds: aThrow.map((c) => c.id) });
    s = first.state;
    expect(eventTypes(first.events)).toEqual(['DISCARD_CHOSEN']);
    expect(player(s, 'a').hand).toHaveLength(12); // nothing moves yet
    expect(getPlayerView(s, 'b').yourDiscard).toBeNull();
    expect(getPlayerView(s, 'a').yourDiscard).toEqual(aThrow.map((c) => c.id));
    // hands are open, but WHICH cards a chose stays secret until everyone has chosen
    const seenByB = getPlayerView(s, 'b');
    expect(seenByB.players[0]!.hand).toHaveLength(12);
    expect(seenByB).not.toHaveProperty('pendingDiscards');
    expect(getPlayerView(s, 'b').players[0]!.hasDiscarded).toBe(true);
    expectError(
      s,
      { type: 'discard', playerId: 'a', cardIds: aThrow.map((c) => c.id) },
      'error.alreadyDiscarded',
    );

    const discardBefore = s.discard.length;
    const r = act(s, { type: 'discard', playerId: 'b', cardIds: bThrow.map((c) => c.id) });
    expect(r.events).toContainEqual({ type: 'CARDS_DISCARDED', playerId: 'a', cards: aThrow });
    expect(r.events).toContainEqual({ type: 'CARDS_DISCARDED', playerId: 'b', cards: bThrow });
    expect(player(r.state, 'a').hand).toHaveLength(10);
    expect(player(r.state, 'b').hand).toHaveLength(10);
    expect(r.state.discard.length).toBe(discardBefore + 3);
    expect(r.state.round).toBe(2);
    expect(r.state.phase).toBe('bidding');
  });

  it('is skipped when nobody is over the limit', () => {
    const s = skipToEat(newGame(3), { a: handOf(10) });
    const { state, events } = finishEating(s);
    expect(eventTypes(events)).not.toContain('DISCARD_CHOSEN');
    expect(state.phase).toBe('bidding');
    expect(state.round).toBe(2);
  });

  it('is skipped in the final round — the game ends with oversized hands intact', () => {
    const { state } = finishEating(overLimit(5));
    expect(state.phase).toBe('gameOver');
    expect(player(state, 'a').hand).toHaveLength(12);
    expect(state.result!.scores.find((x) => x.playerId === 'a')!.handCount).toBe(12);
  });
});
