import { isFood } from '../cards.ts';
import type { FoodType } from '../config.ts';
import {
  bestPick,
  type BotCtx,
  type BotPolicy,
  cheapestDiscards,
  completesMeal,
  countKind,
  dogRisk,
  opponents,
  patientMeal,
  rankedMeals,
  sortedMeow,
  threatenedFoods,
} from './common.ts';
import { BOT_TUNING } from './tuning.ts';

const T = BOT_TUNING.sly;

/** Foods rivals are visibly collecting: two or more in an open hand. */
function contestedFoods(ctx: BotCtx): Set<FoodType> {
  const foods = threatenedFoods(ctx.view);
  for (const p of opponents(ctx)) {
    for (const card of p.hand)
      if (isFood(card.kind) && countKind(p.hand, card.kind) >= 2) foods.add(card.kind);
  }
  return foods;
}

/**
 * แมวดำเจ้าเล่ห์ — tries to clash with the leader's likely bid, otherwise takes a
 * number nobody else has left; eats foods others are collecting (open hands) before they can;
 * digs moderately.
 */
export const sly: BotPolicy = {
  bid: (ctx) => {
    const { me, rng } = ctx;
    const mine = sortedMeow(me);
    const rivals = opponents(ctx);

    // Spoil the leader: people tend to throw their highest number.
    const leader = [...rivals].sort((a, b) => b.mealPoints - a.mealPoints)[0];
    if (leader && leader.mealPoints > me.mealPoints) {
      const guess = Math.max(...leader.meowLeft);
      if (mine.includes(guess) && rng.next() < T.spoilChance) return guess;
    }
    // A number no opponent still holds can never clash.
    const safe = mine.filter((v) => rivals.every((p) => !p.meowLeft.includes(v)));
    if (safe.length > 0) return safe.at(-1)!;
    return mine[Math.floor(mine.length / 2)]!;
  },

  pick: (ctx) => {
    const { view } = ctx;
    // Hate-draft: a card that would finish a rival's meal is worth taking away.
    const rivals = opponents(ctx);
    return bestPick(ctx, (card) => {
      if (!isFood(card.kind)) return 0;
      const blocks = rivals.filter((p) => completesMeal(p.hand, card)).length;
      return blocks * 0.5 * view.prices[card.kind];
    });
  },

  keepDigging: ({ view }) => view.bag.length < T.maxBag && dogRisk(view) <= T.maxDogRisk,
  throwBone: ({ view }) => view.bag.length >= T.boneMinBag,

  meal: (ctx) => {
    const contested = contestedFoods(ctx);
    // Eat what others are collecting first, so the price drops before their turn.
    return (
      rankedMeals(ctx.view, (f) => contested.has(f))[0] ??
      patientMeal(ctx.view, BOT_TUNING.careful.eatSmallAtPrice)
    );
  },

  discard: (ctx) => cheapestDiscards(ctx, 0.5),
};
