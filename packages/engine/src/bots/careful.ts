import {
  bestPick,
  type BotPolicy,
  cheapestDiscards,
  completesMeal,
  countKind,
  dogRisk,
  leaning,
  patientMeal,
  sortedMeow,
} from './common.ts';
import { BOT_TUNING } from './tuning.ts';

const T = BOT_TUNING.careful;

/**
 * แมวขาวขี้ระวัง — saves high meow numbers for later rounds, stops digging early
 * unless it holds a bone, and waits for big feasts while prices are high.
 */
export const careful: BotPolicy = {
  bid: ({ view, me, rng }) => {
    const meow = sortedMeow(me);
    // Spend its highest number only when the stall has a card that finishes a meal.
    const worthIt = view.round >= 2 && view.market.some((card) => completesMeal(view.hand, card));
    // Spare numbers (more cards than rounds left) would be wasted: cash in the high ones late.
    const roundsLeft = view.config.rounds - view.round + 1;
    const late = meow.length > roundsLeft && roundsLeft <= T.highBidLastRounds;
    return worthIt || late ? meow.at(-1)! : leaning(meow, rng, T.lowBidChance);
  },
  pick: (ctx) => bestPick(ctx),
  keepDigging: ({ view }) =>
    view.bag.length < T.maxBag &&
    dogRisk(view) <= (countKind(view.hand, 'bone') > 0 ? T.maxDogRiskWithBone : T.maxDogRisk),
  throwBone: ({ view }) => view.bag.length > 0,
  meal: ({ view }) => patientMeal(view, T.eatSmallAtPrice),
  discard: (ctx) => cheapestDiscards(ctx, T.boneKeepBias),
};
