import {
  bestPick,
  type BotPolicy,
  cheapestDiscards,
  dogRisk,
  leaning,
  rankedMeals,
  sortedMeow,
} from './common.ts';
import { BOT_TUNING } from '../config.ts';

const T = BOT_TUNING.greedy;

/** แมวส้มตะกละ — bids high from the start, digs until the dog risk gets high, eats as soon as it can. */
export const greedy: BotPolicy = {
  bid: ({ me, rng }) => leaning(sortedMeow(me).reverse(), rng, T.topBidChance),
  pick: (ctx) => bestPick(ctx),
  keepDigging: ({ view }) => view.bag.length < T.maxBag && dogRisk(view) <= T.maxDogRisk,
  throwBone: ({ view }) => view.bag.length > 0,
  meal: ({ view }) => rankedMeals(view)[0] ?? null,
  discard: (ctx) => cheapestDiscards(ctx),
};
