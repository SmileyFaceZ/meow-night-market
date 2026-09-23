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

  // ── Experimental balance levers (Phase 2 study, NOT in GAME_RULES.md) ──────
  // Defaults reproduce the official rules. Kept only until the user picks a fix.
  /** Food types in the deck (each with foodCopies cards). */
  readonly foodTypes: readonly FoodType[];
  /** Leftover stall cards are shuffled into the bin instead of discarded. */
  readonly leftoverMarketToTrash: boolean;
  /** Free cards each clashed player draws from the bin (a dog there does nothing). */
  readonly clashConsolationDraws: number;
  /** Clashed players still pick, after the unique bidders (in turn order). */
  readonly clashedPickLast: boolean;
  /** The discard pile is shuffled into the bin at the start of every Trash Dig. */
  readonly recycleDiscardEachRound: boolean;
  /** Equal bids: 'seat' (official), 'lowestScore' first then seat, or 'random' (seeded, redrawn each round). */
  readonly clashTieBreak: 'seat' | 'lowestScore' | 'random';
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

  foodTypes: FOOD_TYPES,
  leftoverMarketToTrash: false,
  clashConsolationDraws: 0,
  clashedPickLast: false,
  recycleDiscardEachRound: false,
  clashTieBreak: 'seat',
};

export function validateConfig(config: GameConfig): void {
  if (config.meowValues.length !== config.rounds) {
    throw new Error('config.meowValues must have exactly one card per round');
  }
  if (new Set(config.meowValues).size !== config.meowValues.length) {
    throw new Error('config.meowValues must be distinct');
  }
  if (config.foodTypes.length === 0 || new Set(config.foodTypes).size !== config.foodTypes.length) {
    throw new Error('config.foodTypes must be a non-empty list of distinct food types');
  }
  if (config.minPrice > config.startPrice) {
    throw new Error('config.minPrice must not exceed config.startPrice');
  }
}
