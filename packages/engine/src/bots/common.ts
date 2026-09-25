// Shared building blocks for the bot personalities. Bots see only a PlayerView.

import { findMealOptions, isFood, type MealOption } from '../cards.ts';
import { FOOD_TYPES, type FoodType } from '../config.ts';
import type { Rng } from '../rng.ts';
import type { Action, Card, CardId } from '../types.ts';
import type { PlayerView, PublicPlayer } from '../view.ts';
import { knownNextCard, powerMove } from './powers.ts';

export interface BotCtx {
  readonly view: PlayerView;
  readonly me: PublicPlayer;
  readonly rng: Rng;
}

/** One decision per phase; `runPolicy` turns them into actions. */
export interface BotPolicy {
  bid(ctx: BotCtx): number;
  pick(ctx: BotCtx): CardId;
  keepDigging(ctx: BotCtx): boolean;
  throwBone(ctx: BotCtx): boolean;
  /** Next meal to eat this turn, or null to finish eating. */
  meal(ctx: BotCtx): MealOption | null;
  discard(ctx: BotCtx): CardId[];
}

export function runPolicy(policy: BotPolicy, view: PlayerView, rng: Rng): Action | null {
  const playerId = view.viewer;
  const me = view.players.find((p) => p.id === playerId);
  if (playerId === null || !me) return null;
  const ctx: BotCtx = { view, me, rng };
  const myTurn = view.currentPlayer === playerId;
  // Someone else's power window: wait.
  if (view.powerWindow && view.powerWindow.playerId !== playerId) return null;
  const power = powerMove(policy, ctx);
  if (power) return power;

  switch (view.phase) {
    case 'bidding':
      return me.hasBid ? null : { type: 'bid', playerId, value: policy.bid(ctx) };
    case 'pick':
      return myTurn ? { type: 'pick', playerId, cardId: policy.pick(ctx) } : null;
    case 'trash':
      if (!myTurn) return null;
      if (view.pendingDog) {
        const hasBone = view.hand.some((c) => c.kind === 'bone');
        return { type: 'resolveDog', playerId, useBone: hasBone && policy.throwBone(ctx) };
      }
      {
        // Sniffed the bin: we know whether the next card is a dog.
        const next = knownNextCard(view);
        const dig = next ? next.kind !== 'dog' : policy.keepDigging(ctx);
        return view.trashDiggable && dig ? { type: 'dig', playerId } : { type: 'stop', playerId };
      }
    case 'eat': {
      if (!myTurn) return null;
      const meal = policy.meal(ctx);
      return meal
        ? { type: 'eat', playerId, cardIds: meal.cardIds }
        : { type: 'finishEating', playerId };
    }
    case 'discard':
      if (me.mustDiscard === 0 || me.hasDiscarded) return null;
      return { type: 'discard', playerId, cardIds: policy.discard(ctx) };
    case 'gameOver':
      return null;
  }
}

// ── reading the table ────────────────────────────────────────────────────────

export const isLastRound = (view: PlayerView) => view.round >= view.config.rounds;

export function countKind(cards: readonly Card[], kind: Card['kind']): number {
  return cards.filter((c) => c.kind === kind).length;
}

/**
 * Chance that the next dig turns up a dog. When only dogs are left the discard
 * pile gets shuffled in first, so the odds are taken over that combined pile.
 */
export function dogRisk(view: PlayerView): number {
  const dogs = view.trashDogCount;
  const others = view.trashCount - dogs;
  const pool = others > 0 ? view.trashCount : dogs + view.discard.length;
  return pool === 0 ? 1 : dogs / pool;
}

const PROGRESS_WEIGHT = [0.35, 0.65, 1, 0.8] as const;

/** How much `card` is worth to a player already holding `hand` (roughly: expected points). */
export function cardValue(view: PlayerView, hand: readonly Card[], card: Card): number {
  const gold = countKind(hand, 'goldfish');
  if (isFood(card.kind)) {
    const have = countKind(hand, card.kind);
    const price = view.prices[card.kind];
    if (isLastRound(view)) {
      // No future rounds: only worth it if it finishes a meal right now.
      return have >= 2 || (have === 1 && gold > 0) ? price : 0.1;
    }
    return have >= 4 ? 0.15 * price : PROGRESS_WEIGHT[have as 0 | 1 | 2 | 3] * price;
  }
  if (card.kind === 'goldfish') {
    const best = Math.max(
      ...FOOD_TYPES.map((f) => {
        const have = countKind(hand, f);
        return (have >= 2 ? 0.9 : have === 1 ? 0.5 : 0.25) * view.prices[f];
      }),
    );
    return gold > 0 ? best / 2 : best;
  }
  if (card.kind === 'bone') return countKind(hand, 'bone') === 0 ? 2 : 0.6;
  return 0;
}

/** Highest-value market card (ties broken randomly). */
export function bestPick(ctx: BotCtx, bonus: (card: Card) => number = () => 0): CardId {
  const { view, rng } = ctx;
  const scored = view.market.map((card) => ({
    card,
    score: cardValue(view, view.hand, card) + bonus(card) + rng.next() * 0.01,
  }));
  scored.sort((a, b) => b.score - a.score);
  return scored[0]!.card.id;
}

/** Throw away the cards whose loss hurts least. */
export function cheapestDiscards(ctx: BotCtx, boneBias = 0): CardId[] {
  const { view, me } = ctx;
  const keep = view.hand.map((card) => {
    const rest = view.hand.filter((c) => c.id !== card.id);
    const bias = card.kind === 'bone' ? boneBias : 0;
    return { id: card.id, value: cardValue(view, rest, card) + bias };
  });
  keep.sort((a, b) => a.value - b.value);
  return keep.slice(0, me.mustDiscard).map((k) => k.id);
}

export function mealPoints(view: PlayerView, option: MealOption): number {
  const price = view.prices[option.food];
  return option.big ? price * view.config.bigMealMultiplier : price;
}

/** Legal meals, best first: most points, then saving the goldfish when possible. */
export function rankedMeals(view: PlayerView, only?: (food: FoodType) => boolean): MealOption[] {
  return findMealOptions(view.hand, view.config)
    .filter((o) => !only || only(o.food))
    .sort(
      (a, b) =>
        mealPoints(view, b) - mealPoints(view, a) ||
        Number(a.usesGoldfish) - Number(b.usesGoldfish),
    );
}

/**
 * Foods a rival who eats after me this round could eat too (hands are open) —
 * eating those first scores before the price drops.
 */
export function threatenedFoods(view: PlayerView): Set<FoodType> {
  const foods = new Set<FoodType>();
  const myTurn = view.turnOrder.indexOf(view.viewer ?? '');
  for (const p of view.players) {
    if (p.id === view.viewer || view.turnOrder.indexOf(p.id) < myTurn) continue;
    for (const option of findMealOptions(p.hand, view.config)) foods.add(option.food);
  }
  return foods;
}

/** "Wait for the big feast" logic shared by careful and sly — but never wait into a price drop. */
export function patientMeal(view: PlayerView, eatSmallAtPrice: number): MealOption | null {
  const meals = rankedMeals(view);
  if (isLastRound(view)) return meals[0] ?? null;
  const big = meals.find((m) => m.big);
  if (big) return big;
  const threatened = threatenedFoods(view);
  const nearLimit = view.hand.length >= view.config.handLimit - 1;
  return (
    meals.find(
      (m) => nearLimit || threatened.has(m.food) || view.prices[m.food] <= eatSmallAtPrice,
    ) ?? null
  );
}

export const opponents = (ctx: BotCtx) => ctx.view.players.filter((p) => p.id !== ctx.me.id);

export const sortedMeow = (me: PublicPlayer) => [...me.meowLeft].sort((a, b) => a - b);

/** Would taking `card` let this hand eat a (new) meal? */
export function completesMeal(hand: readonly Card[], card: Card): boolean {
  const gold = countKind(hand, 'goldfish');
  if (isFood(card.kind)) {
    const have = countKind(hand, card.kind);
    return have === 2 || (have === 1 && gold > 0);
  }
  if (card.kind === 'goldfish') return FOOD_TYPES.some((f) => countKind(hand, f) === 2);
  return false;
}

/** Mostly the first choice, sometimes the second — keeps bots from being perfectly predictable. */
export function leaning<T>(ranked: readonly T[], rng: Rng, firstChance = 0.7): T {
  return ranked.length > 1 && rng.next() >= firstChance ? ranked[1]! : ranked[0]!;
}
