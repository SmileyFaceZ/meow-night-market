// Every knob the bot personalities use, in one place (GAME_RULES §9, DECISIONS 019/024).
// Tuned with `npm run balance`: only risk thresholds and timing are adjusted —
// never anything that makes a bot look silly (e.g. skipping a high-value meal).

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
  },
  careful: {
    maxDogRisk: 0.19,
    maxDogRiskWithBone: 0.35,
    maxBag: 5,
    /** Chance to bid its lowest number (otherwise the second lowest). */
    lowBidChance: 0.7,
    /** Eat a normal (3-card) meal without waiting once its price is this low. */
    eatSmallAtPrice: 3,
  },
};
