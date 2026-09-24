import { describe, expect, it } from 'vitest';
import type { GameState } from '../src/types.ts';
import { getPlayerView } from '../src/view.ts';
import {
  act,
  actAll,
  card,
  cards,
  eventTypes,
  expectError,
  newGame,
  patch,
  patchPlayer,
  player,
  skipToTrash,
} from './helpers.ts';

/** Trash phase with a known bin; the first digger is returned as `who`. */
function trashWith(deck: GameState['trashDeck'], extra: Partial<GameState> = {}) {
  const s = patch(skipToTrash(newGame(3)).state, { trashDeck: deck, discard: [], ...extra });
  return { s, who: s.turnOrder[0]!, next: s.turnOrder[1]! };
}

describe('§5 Trash Dig', () => {
  it('only the current player may dig, one card at a time, into a public bag', () => {
    const deck = cards('fish', 'milk', 'snack');
    const { s, who, next } = trashWith(deck);
    expectError(s, { type: 'dig', playerId: next }, 'error.notYourTurn');

    const r = act(s, { type: 'dig', playerId: who });
    expect(r.state.bag).toEqual([deck[0]]);
    expect(r.state.trashDeck).toEqual(deck.slice(1));
    expect(r.events).toContainEqual({ type: 'CARD_DUG', playerId: who, card: deck[0], to: 'bag' });
    // everyone sees the bag
    expect(getPlayerView(r.state, next).bag).toEqual([deck[0]]);
  });

  it('"stop" moves the bag into the hand and ends the turn', () => {
    const deck = cards('fish', 'milk', 'snack');
    const { s, who, next } = trashWith(deck);
    const r = actAll(s, [
      { type: 'dig', playerId: who },
      { type: 'dig', playerId: who },
      { type: 'stop', playerId: who },
    ]);
    expect(player(r.state, who).hand).toEqual(deck.slice(0, 2));
    expect(r.state.bag).toEqual([]);
    expect(r.state.turnOrder[r.state.turnIndex]).toBe(next);
  });

  it('a player may stop without digging at all', () => {
    const { s, who, next } = trashWith(cards('fish'));
    const r = act(s, { type: 'stop', playerId: who });
    expect(player(r.state, who).hand).toEqual([]);
    expect(r.state.turnOrder[r.state.turnIndex]).toBe(next);
  });

  it('there is no dig limit per turn', () => {
    const deck = Array.from({ length: 30 }, () => card('chicken'));
    let { s } = trashWith(deck);
    const who = s.turnOrder[0]!;
    for (let i = 0; i < 30; i++) s = act(s, { type: 'dig', playerId: who }).state;
    expect(s.bag).toHaveLength(30);
  });

  it('a dug bone goes straight into the hand (safe from dogs)', () => {
    const [bone, dog] = cards('bone', 'dog');
    const { s, who } = trashWith([bone!, dog!, ...cards('fish')]);
    const r = act(s, { type: 'dig', playerId: who });
    expect(player(r.state, who).hand).toEqual([bone]);
    expect(r.state.bag).toEqual([]);
    expect(r.events).toContainEqual({ type: 'CARD_DUG', playerId: who, card: bone, to: 'hand' });
  });

  it('a dog with no bone in hand chases the player off: bag discarded, turn over', () => {
    const [fish, milk, dog] = cards('fish', 'milk', 'dog');
    const { s, who, next } = trashWith([fish!, milk!, dog!, ...cards('snack')]);
    const r = actAll(s, [
      { type: 'dig', playerId: who },
      { type: 'dig', playerId: who },
      { type: 'dig', playerId: who },
    ]);
    expect(player(r.state, who).hand).toEqual([]);
    expect(r.state.discard).toEqual([fish, milk]);
    expect(r.state.turnOrder[r.state.turnIndex]).toBe(next);
    expect(r.events).toContainEqual({ type: 'DOG_CAUGHT', playerId: who, lost: [fish, milk] });
  });

  it('a dog lets a player holding a bone choose; throwing it saves the bag and the turn goes on', () => {
    const [bone, fish, dog] = cards('bone', 'fish', 'dog');
    const setup = trashWith([fish!, dog!, ...cards('snack', 'milk')]);
    const who = setup.who;
    let s = setup.s;
    s = patchPlayer(s, who, { hand: [bone!] });
    s = act(s, { type: 'dig', playerId: who }).state;
    const r = act(s, { type: 'dig', playerId: who });
    expect(r.events).toContainEqual({ type: 'DOG_APPEARED', playerId: who, canThrowBone: true });
    expect(r.state.pendingDog).toEqual(dog);
    // must decide before doing anything else
    expectError(r.state, { type: 'dig', playerId: who }, 'error.dogPending');
    expectError(r.state, { type: 'stop', playerId: who }, 'error.dogPending');

    const saved = act(r.state, { type: 'resolveDog', playerId: who, useBone: true });
    expect(saved.state.pendingDog).toBeNull();
    expect(player(saved.state, who).hand).toEqual([]);
    expect(saved.state.discard).toEqual([bone]); // the bone goes to the discard pile
    expect(saved.state.bag).toEqual([fish]);
    expect(saved.state.turnOrder[saved.state.turnIndex]).toBe(who);
    // can keep digging or stop
    const more = act(saved.state, { type: 'dig', playerId: who });
    expect(more.state.bag).toHaveLength(2);
  });

  it('a player with a bone may decline to throw it and be chased off', () => {
    const [bone, fish, dog] = cards('bone', 'fish', 'dog');
    const setup = trashWith([fish!, dog!, ...cards('snack')]);
    const { who, next } = setup;
    let s = setup.s;
    s = patchPlayer(s, who, { hand: [bone!] });
    s = actAll(s, [
      { type: 'dig', playerId: who },
      { type: 'dig', playerId: who },
    ]).state;
    const r = act(s, { type: 'resolveDog', playerId: who, useBone: false });
    expect(player(r.state, who).hand).toEqual([bone]);
    expect(r.state.discard).toEqual([fish]);
    expect(r.state.turnOrder[r.state.turnIndex]).toBe(next);
  });

  it('resolveDog is only valid while a dog is waiting', () => {
    const { s, who } = trashWith(cards('fish'));
    expectError(s, { type: 'resolveDog', playerId: who, useBone: true }, 'error.noDogPending');
  });

  it('every drawn dog is shuffled back into the bin', () => {
    const dog = card('dog');
    const { s, who } = trashWith([dog, ...cards('fish', 'milk', 'snack')]);
    const r = act(s, { type: 'dig', playerId: who });
    expect(r.state.trashDeck).toHaveLength(4);
    expect(r.state.trashDeck).toContainEqual(dog);
    expect(r.events).toContainEqual({ type: 'DOG_RETURNED' });

    // same with a thrown bone
    const [bone, dog2] = cards('bone', 'dog');
    let t = trashWith([dog2!, ...cards('fish')]);
    t = { ...t, s: patchPlayer(t.s, t.who, { hand: [bone!] }) };
    const thrown = actAll(t.s, [
      { type: 'dig', playerId: t.who },
      { type: 'resolveDog', playerId: t.who, useBone: true },
    ]);
    expect(thrown.state.trashDeck).toContainEqual(dog2);
    expect(thrown.state.trashDeck).toHaveLength(2);
  });

  it('when the bin holds only dogs, the discard pile is shuffled in with them', () => {
    const dogs = cards('dog', 'dog');
    const pile = cards('fish', 'milk', 'bone');
    const { s, who } = trashWith(dogs, { discard: pile });
    const r = act(s, { type: 'dig', playerId: who });
    expect(r.events[0]).toEqual({ type: 'TRASH_RESHUFFLED', count: 3 });
    expect(r.state.discard).toEqual([]);
    // 2 dogs + 3 recycled cards; a drawn dog would go straight back into the bin
    const kept = r.state.bag.length + player(r.state, who).hand.length;
    expect(r.state.trashDeck.length + kept).toBe(5);
  });

  it('when the bin is empty, the discard pile becomes the new bin', () => {
    const { s, who } = trashWith([], { discard: cards('fish', 'milk') });
    const r = act(s, { type: 'dig', playerId: who });
    expect(eventTypes(r.events)).toEqual(['TRASH_RESHUFFLED', 'CARD_DUG']);
    expect(r.state.bag).toHaveLength(1);
  });

  it('only dogs and an empty discard pile: digging is disabled, stopping still works', () => {
    const { s, who } = trashWith(cards('dog', 'dog'), { discard: [] });
    expect(getPlayerView(s, who).trashDiggable).toBe(false);
    expectError(s, { type: 'dig', playerId: who }, 'error.trashEmpty');
    expect(act(s, { type: 'stop', playerId: who }).state.turnIndex).toBe(1);
  });

  it('after the last digger the Feast Time phase begins', () => {
    const { s } = trashWith(cards('fish'));
    const r = actAll(
      s,
      s.turnOrder.map((id) => ({ type: 'stop', playerId: id }) as const),
    );
    expect(r.events).toContainEqual({
      type: 'PHASE_STARTED',
      phase: 'eat',
      turnOrder: s.tieOrder, // all tied: dug in reverse, eat in tie-break order,
    });
    // nobody holds a meal, so every eat turn is skipped and round 2 begins
    expect(eventTypes(r.events).filter((t) => t === 'TURN_SKIPPED')).toHaveLength(3);
    expect(r.state.round).toBe(2);
  });
});
