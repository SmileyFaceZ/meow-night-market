// Every number from docs/GAME_RULES.md lives here so balance can be tuned in one place.

export const FOOD_TYPES = ['fish', 'chicken', 'shrimp', 'milk', 'snack'] as const;
export type FoodType = (typeof FOOD_TYPES)[number];

export interface GameConfig {
  /** Rounds per game. Must equal meowValues.length (each meow card is used exactly once). */
  readonly rounds: number;
  /** Meow bid cards every player owns. */
  readonly meowValues: readonly number[];
  /** Copies of each food type. */
  readonly foodCopies: number;
  readonly goldfishCopies: number;
  readonly boneCopies: number;
  readonly dogCopies: number;
  /** marketSize = players + marketExtra */
  readonly marketExtra: number;
  readonly startPrice: number;
  readonly minPrice: number;
  readonly priceDropPerMeal: number;
  readonly mealSize: number;
  readonly bigMealSize: number;
  readonly bigMealMultiplier: number;
  readonly maxWildsPerMeal: number;
  readonly minRealPerMeal: number;
  readonly handLimit: number;
  readonly varietyBonus: number;
  /** Food types a player must have eaten to be eligible for the variety bonus. */
  readonly varietyMinTypes: number;
  readonly minPlayers: number;
  readonly maxPlayers: number;

  /** Free cards each clashed player draws from the bin after picking (CLASH_FREE_DRAWS). */
  readonly clashFreeDraws: number;
}

export const DEFAULT_CONFIG: GameConfig = {
  rounds: 5, // ROUNDS
  meowValues: [1, 2, 3, 4, 5],
  foodCopies: 8,
  goldfishCopies: 2,
  boneCopies: 3,
  dogCopies: 4,
  marketExtra: 1,
  startPrice: 5, // START_PRICE
  minPrice: 1, // MIN_PRICE
  priceDropPerMeal: 1,
  mealSize: 3,
  bigMealSize: 4,
  bigMealMultiplier: 2,
  maxWildsPerMeal: 1,
  minRealPerMeal: 2,
  handLimit: 10, // HAND_LIMIT
  varietyBonus: 3, // VARIETY_BONUS
  varietyMinTypes: 2,
  minPlayers: 2,
  maxPlayers: 4,

  clashFreeDraws: 1, // CLASH_FREE_DRAWS
};

export function validateConfig(config: GameConfig): void {
  if (config.meowValues.length !== config.rounds) {
    throw new Error('config.meowValues must have exactly one card per round');
  }
  if (new Set(config.meowValues).size !== config.meowValues.length) {
    throw new Error('config.meowValues must be distinct');
  }
  if (config.minPrice > config.startPrice) {
    throw new Error('config.minPrice must not exceed config.startPrice');
  }
}
