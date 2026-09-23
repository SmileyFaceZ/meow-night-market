import {
  bestPick,
  type BotPolicy,
  cheapestDiscards,
  dogRisk,
  leaning,
  rankedMeals,
  sortedMeow,
} from './common.ts';

/** แมวส้มตะกละ — bids high from the start, digs until the dog risk passes 35%, eats as soon as it can. */
export const greedy: BotPolicy = {
  bid: ({ me, rng }) => leaning(sortedMeow(me).reverse(), rng),
  pick: (ctx) => bestPick(ctx),
  keepDigging: ({ view }) => dogRisk(view) <= 0.35,
  throwBone: ({ view }) => view.bag.length > 0,
  meal: ({ view }) => rankedMeals(view)[0] ?? null,
  discard: (ctx) => cheapestDiscards(ctx),
};
