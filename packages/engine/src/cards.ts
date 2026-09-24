import { FOOD_TYPES, type FoodType, type GameConfig } from './config.ts';
import type { Card, CardId, CardKind } from './types.ts';

export function isFood(kind: CardKind): kind is FoodType {
  return (FOOD_TYPES as readonly string[]).includes(kind);
}

/** Every card in the game, ids assigned in a fixed order before any shuffle. */
export function buildDeck(
  config: GameConfig,
  playerCount: number,
): { food: Card[]; hazards: Card[] } {
  let id = 0;
  const make = (kind: CardKind, copies: number): Card[] =>
    Array.from({ length: copies }, () => ({ id: id++, kind }));

  const food = [
    ...FOOD_TYPES.flatMap((kind) => make(kind, foodCopiesFor(config, playerCount))),
    ...make('goldfish', config.goldfishCopies),
  ];
  const hazards = [...make('bone', config.boneCopies), ...make('dog', config.dogCopies)];
  return { food, hazards };
}

export function foodCopiesFor(config: GameConfig, playerCount: number): number {
  const copies = config.foodCopies[playerCount];
  if (copies === undefined)
    throw new Error(`config.foodCopies has no entry for ${playerCount} players`);
  return copies;
}

export function totalCardCount(config: GameConfig, playerCount: number): number {
  return (
    FOOD_TYPES.length * foodCopiesFor(config, playerCount) +
    config.goldfishCopies +
    config.boneCopies +
    config.dogCopies
  );
}

export interface MealCheck {
  readonly food: FoodType;
  readonly big: boolean;
}

/**
 * GAME_RULES §6: 3 (meal) or 4 (big meal) cards of one food type;
 * at most one goldfish as a wild, and at least two real food cards.
 */
export function checkMeal(cards: readonly Card[], config: GameConfig): MealCheck | null {
  const size = cards.length;
  if (size !== config.mealSize && size !== config.bigMealSize) return null;

  const wilds = cards.filter((c) => c.kind === 'goldfish').length;
  const real = cards.filter((c) => c.kind !== 'goldfish');
  if (wilds > config.maxWildsPerMeal || real.length < config.minRealPerMeal) return null;

  const first = real[0]?.kind;
  if (first === undefined || !isFood(first)) return null;
  if (!real.every((c) => c.kind === first)) return null;

  return { food: first, big: size === config.bigMealSize };
}

export interface MealOption {
  readonly food: FoodType;
  readonly big: boolean;
  readonly usesGoldfish: boolean;
  readonly cardIds: readonly CardId[];
}

/** Every distinct meal the hand can make right now (cards of one kind are interchangeable). */
export function findMealOptions(hand: readonly Card[], config: GameConfig): MealOption[] {
  const goldfish = hand.filter((c) => c.kind === 'goldfish');
  const options: MealOption[] = [];

  for (const food of FOOD_TYPES) {
    const real = hand.filter((c) => c.kind === food);
    for (const size of [config.mealSize, config.bigMealSize]) {
      const maxWilds = Math.min(
        config.maxWildsPerMeal,
        goldfish.length,
        size - config.minRealPerMeal,
      );
      for (let wilds = 0; wilds <= maxWilds; wilds++) {
        const needReal = size - wilds;
        if (real.length < needReal) continue;
        options.push({
          food,
          big: size === config.bigMealSize,
          usesGoldfish: wilds > 0,
          cardIds: [...real.slice(0, needReal), ...goldfish.slice(0, wilds)].map((c) => c.id),
        });
      }
    }
  }
  return options;
}
