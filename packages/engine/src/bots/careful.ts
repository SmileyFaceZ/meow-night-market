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

/**
 * แมวขาวขี้ระวัง — saves high meow numbers for later rounds, stops digging early
 * (risk > 20%) unless it holds a bone, and waits for big feasts while prices are high.
 */
export const careful: BotPolicy = {
  bid: ({ view, me, rng }) => {
    const meow = sortedMeow(me);
    // Spend its highest number only when the stall has a card that finishes a meal.
    const worthIt = view.round >= 2 && view.market.some((card) => completesMeal(view.hand, card));
    return worthIt ? meow.at(-1)! : leaning(meow, rng);
  },
  pick: (ctx) => bestPick(ctx),
  keepDigging: ({ view }) => dogRisk(view) <= (countKind(view.hand, 'bone') > 0 ? 0.35 : 0.2),
  throwBone: ({ view }) => view.bag.length > 0,
  meal: ({ view }) => patientMeal(view),
  discard: (ctx) => cheapestDiscards(ctx, 1.5),
};
