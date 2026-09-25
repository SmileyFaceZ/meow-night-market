// Every balance number lives here — game rules (docs/GAME_RULES.md) AND bot behaviour (§9).
// Change a value, run `npm run balance`, compare with docs/BALANCE.md.

export const FOOD_TYPES = ['fish', 'chicken', 'shrimp', 'milk', 'snack'] as const;
export type FoodType = (typeof FOOD_TYPES)[number];

export interface GameConfig {
  /** Rounds per game. Must equal meowValues.length (each meow card is used exactly once). */
  readonly rounds: number;
  /** Meow bid cards every player owns. */
  readonly meowValues: readonly number[];
  /** Copies of each food type, by player count (keeps the bin's food supply similar at every table size). */
  readonly foodCopies: Readonly<Record<number, number>>;
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
  /**
   * Scavenger (white cat, GAME_RULES §14): take a food card from the discard pile on your
   * eat turn ('eat'), or take the stall's leftover card once everyone has picked ('afterPick',
   * the alternative the user asked to test — DECISIONS 044).
   */
  readonly scavengerTiming: 'eat' | 'afterPick';
  /**
   * Good-Luck Cat (korat): after surviving the dog, keep digging ('keepDigging', the rule),
   * keep the bag but end the turn ('endTurn'), or lose half the bag and carry on ('halfBag').
   * The last two are balance experiments (docs/BALANCE.md).
   */
  readonly goodLuckEffect: 'keepDigging' | 'endTurn' | 'halfBag' | 'halfBagEndTurn';
}

export const DEFAULT_CONFIG: GameConfig = {
  rounds: 5, // ROUNDS
  meowValues: [1, 2, 3, 4, 5],
  // 27 food cards start in the bin at every table size (the stall takes 5 per extra player)
  foodCopies: { 2: 8, 3: 9, 4: 10 },
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
  scavengerTiming: 'eat',
  goodLuckEffect: 'keepDigging',
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

// ── Bots (GAME_RULES §9, DECISIONS 019/024) ──────────────────────────────────
// Tuned with `npm run balance`: only risk thresholds and timing are adjusted —
// never anything that makes a bot look silly (e.g. skipping a high-value meal).

/** Easy bots make a random (legal) decision this often. */
export const EASY_MISTAKE_RATE = 0.3;

export const BOT_TUNING = {
  greedy: {
    /** Keep digging while the chance of a dog is at most this. */
    maxDogRisk: 0.28,
    /** Stop digging once the bag holds this many cards (push-your-luck: more to lose). */
    maxBag: 6,
    /** Chance to bid its highest number (otherwise the second highest). */
    topBidChance: 0.7,
  },
  sly: {
    maxDogRisk: 0.24,
    maxBag: 99,
    /** Chance to copy the leader's likely bid to force a clash. */
    spoilChance: 0.7,
    /** Throw a bone at a dog only when the bag holds at least this many cards. */
    boneMinBag: 2,
    /** Extra value (× price) of a stall card that would finish a rival's meal (hate-draft). */
    blockWeight: 0.5,
    /** How much it values keeping a bone when discarding (added to the bone's worth). */
    boneKeepBias: 0.5,
  },
  careful: {
    maxDogRisk: 0.19,
    maxDogRiskWithBone: 0.35,
    maxBag: 5,
    /** Chance to bid its lowest number (otherwise the second lowest). */
    lowBidChance: 0.7,
    /** Eat a normal (3-card) meal without waiting once its price is this low. */
    eatSmallAtPrice: 3,
    boneKeepBias: 1.5,
  },
};

// ── Bots and cat powers (GAME_RULES §14) ─────────────────────────────────────
// Simple rules per power; a bot that ends the game without using its power must have
// had no chance (the balance report checks). Tuned with `npm run balance`.

export const POWER_TUNING = {
  keenNose: {
    /** Sniff before the first draw once the chance of a dog is at least this. */
    minDogRisk: 0.12,
  },
  secondThought: {
    /** From this round on, also move up to a free higher number when not clashing. */
    climbFromRound: 1,
  },
  scavenger: {
    /** From this round on, take any food card, not only one that finishes a meal. */
    anyCardFromRound: 1,
  },
  luckySwap: {
    /** Swap when no stall card is worth at least this much to me… */
    minBestValue: 3,
    /** …or anyway from this round on. */
    anywayFromRound: 4,
  },
  goodLuck: {
    /** Use the power on a dog when the bag holds at least this many cards. */
    minBag: 2,
    /** From this round on, use it for any non-empty bag. */
    anyBagFromRound: 4,
  },
  extraOrder: {
    /** Order the leftover card when it would be worth at least this… */
    minLeftoverValue: 2,
    /** …or anyway from this round on. */
    anywayFromRound: 4,
  },
  haggle: {
    /** Before that, raise a price only for a meal I am about to eat; from then, for my best set. */
    anywayFromRound: 4,
  },
  bigAppetite: {
    /** Eat a pair when it scores at least this… */
    minPoints: 3,
    /** …or anyway from this round on. */
    anywayFromRound: 4,
  },
};
