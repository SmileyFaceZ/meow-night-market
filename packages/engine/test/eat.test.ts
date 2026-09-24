import { describe, expect, it } from 'vitest';
import { checkMeal, findMealOptions } from '../src/cards.ts';
import { DEFAULT_CONFIG } from '../src/config.ts';
import type { Card, CardKind, GameState } from '../src/types.ts';
import { getPlayerView } from '../src/view.ts';
import {
  act,
  actAll,
  cards,
  eventTypes,
  expectError,
  finishFeast,
  newGame,
  patch,
  player,
  skipToTrash,
  stopAll,
} from './helpers.ts';

/** Feast Time where the first eater (`who`) holds `hand`; `hands` sets anyone else's. */
function eatWith(hand: Card[], extra: Partial<GameState> = {}, hands: Record<string, Card[]> = {}) {
  const trash = skipToTrash(patch(newGame(3), extra)).state;
  const [who, next] = trash.turnOrder as [string, string];
  const withHands = patch(trash, {
    players: trash.players.map((p) => ({ ...p, hand: p.id === who ? hand : (hands[p.id] ?? []) })),
  });
  return { s: stopAll(withHands).state, who, next };
}
const ids = (cs: Card[]) => cs.map((c) => c.id);
const n = (count: number, kind: CardKind) => cards(...(Array(count).fill(kind) as CardKind[]));

describe('§6 Feast Time', () => {
  it('a meal of 3 same food scores the current market price', () => {
    const hand = n(3, 'fish');
    const { s, who } = eatWith(hand);
    const r = act(s, { type: 'eat', playerId: who, cardIds: ids(hand) });
    const meal = player(r.state, who).meals[0]!;
    expect(meal).toMatchObject({ food: 'fish', big: false, price: 5, points: 5, round: 1 });
    expect(r.events).toContainEqual(
      expect.objectContaining({ type: 'MEAL_EATEN', playerId: who, newPrice: 4 }),
    );
  });

  it('a big meal of 4 same food scores price × 2', () => {
    const hand = n(4, 'milk');
    const { s, who } = eatWith(hand);
    const r = act(s, { type: 'eat', playerId: who, cardIds: ids(hand) });
    expect(player(r.state, who).meals[0]).toMatchObject({ big: true, points: 10 });
  });

  it('scores the price at the moment of eating', () => {
    const hand = n(3, 'snack');
    const { s, who } = eatWith(hand, { prices: { ...newGame().prices, snack: 3 } });
    const r = act(s, { type: 'eat', playerId: who, cardIds: ids(hand) });
    expect(player(r.state, who).meals[0]!.points).toBe(3);
  });

  it('goldfish can stand in for one food per meal', () => {
    const meal = cards('shrimp', 'shrimp', 'goldfish');
    const big = cards('chicken', 'chicken', 'chicken', 'goldfish');
    expect(checkMeal(meal, DEFAULT_CONFIG)).toEqual({ food: 'shrimp', big: false });
    expect(checkMeal(big, DEFAULT_CONFIG)).toEqual({ food: 'chicken', big: true });

    const { s, who } = eatWith(meal);
    const r = act(s, { type: 'eat', playerId: who, cardIds: ids(meal) });
    expect(player(r.state, who).meals[0]).toMatchObject({ food: 'shrimp', points: 5 });
  });

  it('at most one goldfish per meal, and at least two real foods', () => {
    const twoGold = cards('fish', 'fish', 'goldfish', 'goldfish');
    const oneReal = cards('fish', 'goldfish', 'goldfish');
    expect(checkMeal(twoGold, DEFAULT_CONFIG)).toBeNull();
    expect(checkMeal(oneReal, DEFAULT_CONFIG)).toBeNull();
    const { s, who } = eatWith(twoGold); // can still eat fish+fish+goldfish, so the turn starts
    expectError(s, { type: 'eat', playerId: who, cardIds: ids(twoGold) }, 'error.invalidMeal');
  });

  it('rejects mixed foods, wrong sizes, bones and dogs', () => {
    for (const hand of [
      cards('fish', 'fish', 'milk'),
      cards('fish', 'fish'),
      cards('fish', 'fish', 'fish', 'fish', 'fish'),
      cards('bone', 'bone', 'bone'),
      cards('fish', 'fish', 'bone'),
      cards('dog', 'dog', 'dog'),
    ]) {
      expect(checkMeal(hand, DEFAULT_CONFIG)).toBeNull();
    }
    const mixed = cards('fish', 'fish', 'milk');
    const { s, who } = eatWith([...mixed, ...n(3, 'snack')]);
    expectError(s, { type: 'eat', playerId: who, cardIds: ids(mixed) }, 'error.invalidMeal');
  });

  it('can only eat cards from your own hand, each card once, on your own turn', () => {
    const hand = n(3, 'fish');
    const { s, who, next } = eatWith(hand);
    expectError(s, { type: 'eat', playerId: next, cardIds: ids(hand) }, 'error.notYourTurn');
    const [a, b] = ids(hand);
    expectError(s, { type: 'eat', playerId: who, cardIds: [a!, a!, b!] }, 'error.duplicateCard');
    expectError(s, { type: 'eat', playerId: who, cardIds: [a!, b!, 99999] }, 'error.cardNotInHand');
  });

  it('the price of that food drops by 1 after each meal (big meals too), never below 1', () => {
    const hand = n(10, 'fish');
    const setup = eatWith(hand, { prices: { ...newGame().prices, fish: 2 } });
    const who = setup.who;
    let s = setup.s;
    s = act(s, { type: 'eat', playerId: who, cardIds: ids(hand.slice(0, 4)) }).state;
    expect(s.prices.fish).toBe(1);
    const r = actAll(s, [
      { type: 'eat', playerId: who, cardIds: ids(hand.slice(4, 7)) },
      { type: 'eat', playerId: who, cardIds: ids(hand.slice(7, 10)) },
    ]);
    expect(r.state.prices.fish).toBe(1);
    expect(player(r.state, who).meals.map((m) => m.points)).toEqual([4, 1, 1]);
    expect(r.state.prices.milk).toBe(5); // other foods untouched
  });

  it('may eat any number of meals in one turn, or stop early', () => {
    const hand = [...n(3, 'fish'), ...n(3, 'milk')];
    const { s, who } = eatWith(hand);
    const both = actAll(s, [
      { type: 'eat', playerId: who, cardIds: ids(hand.slice(0, 3)) },
      { type: 'eat', playerId: who, cardIds: ids(hand.slice(3)) },
    ]);
    expect(player(both.state, who).meals).toHaveLength(2);

    const none = act(s, { type: 'finishEating', playerId: who });
    expect(player(none.state, who).meals).toHaveLength(0);
    expect(player(none.state, who).hand).toHaveLength(6);
  });

  it('skips a player with nothing to eat automatically (TURN_SKIPPED)', () => {
    const trash = skipToTrash(newGame(3)).state;
    const [first, second] = trash.turnOrder as [string, string];
    const hands: Record<string, Card[]> = {
      [first]: cards('fish', 'milk'),
      [second]: n(3, 'shrimp'),
    };
    const r = stopAll(
      patch(trash, { players: trash.players.map((p) => ({ ...p, hand: hands[p.id] ?? [] })) }),
    );
    expect(r.events).toContainEqual({ type: 'TURN_SKIPPED', playerId: first });
    expect(r.state.turnOrder[r.state.turnIndex]).toBe(second);
    expectError(r.state, { type: 'finishEating', playerId: first }, 'error.notYourTurn');
  });

  it('ends the turn automatically once nothing more can be eaten', () => {
    const trash = skipToTrash(newGame(3)).state;
    const [first, second] = trash.turnOrder as [string, string];
    const mine = [...n(3, 'fish'), ...cards('milk')];
    const hands: Record<string, Card[]> = { [first]: mine, [second]: n(3, 'snack') };
    const s = stopAll(
      patch(trash, { players: trash.players.map((p) => ({ ...p, hand: hands[p.id] ?? [] })) }),
    ).state;
    const r = act(s, { type: 'eat', playerId: first, cardIds: ids(mine.slice(0, 3)) });
    expect(eventTypes(r.events)).toEqual(['MEAL_EATEN', 'TURN_STARTED']);
    expect(r.state.turnOrder[r.state.turnIndex]).toBe(second);
  });

  it('eaten cards leave the hand and are kept in a public meal history', () => {
    const hand = [...n(3, 'fish'), ...cards('bone')];
    const { s, who, next } = eatWith(hand);
    const r = act(s, { type: 'eat', playerId: who, cardIds: ids(hand.slice(0, 3)) });
    expect(player(r.state, who).hand).toEqual([hand[3]]);
    expect(r.state.discard).not.toEqual(expect.arrayContaining(hand.slice(0, 3)));
    expect(player(r.state, who).meals[0]!.cards).toEqual(hand.slice(0, 3));
    // visible to the other players
    const seenByNext = getPlayerView(r.state, next).players.find((p) => p.id === who)!;
    expect(seenByNext.meals[0]!.cards).toEqual(hand.slice(0, 3));
    expect(seenByNext.mealPoints).toBe(5);
  });

  it('market prices carry over into the next round', () => {
    const hand = [...n(3, 'fish'), ...n(3, 'milk')];
    const { s, who } = eatWith(hand);
    const r = finishFeast(
      act(s, { type: 'eat', playerId: who, cardIds: ids(hand.slice(0, 3)) }).state,
    );
    expect(r.state.round).toBe(2);
    expect(r.state.prices.fish).toBe(4);
  });

  it('findMealOptions lists every legal meal shape', () => {
    const hand = cards('fish', 'fish', 'fish', 'fish', 'goldfish', 'milk', 'milk', 'bone');
    const options = findMealOptions(hand, DEFAULT_CONFIG);
    const shapes = options.map((o) => `${o.food}:${o.cardIds.length}:${o.usesGoldfish}`).sort();
    expect(shapes).toEqual(
      ['fish:3:false', 'fish:3:true', 'fish:4:false', 'fish:4:true', 'milk:3:true'].sort(),
    );
    for (const o of options) {
      const chosen = hand.filter((c) => o.cardIds.includes(c.id));
      expect(checkMeal(chosen, DEFAULT_CONFIG)).toEqual({ food: o.food, big: o.big });
    }
  });
});
