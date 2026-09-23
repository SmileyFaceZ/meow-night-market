import { isFood } from '../cards.ts';
import type { FoodType } from '../config.ts';
import type { PublicPlayer } from '../view.ts';
import {
  bestPick,
  type BotCtx,
  type BotPolicy,
  cheapestDiscards,
  countKind,
  dogRisk,
  opponents,
  patientMeal,
  rankedMeals,
  sortedMeow,
} from './common.ts';

/** Foods an opponent has been taking from the stall (public pick history). */
function collectedBy(p: PublicPlayer): Set<FoodType> {
  const foods = new Set<FoodType>();
  for (const card of p.picks) if (isFood(card.kind)) foods.add(card.kind);
  return foods;
}

function contestedFoods(ctx: BotCtx): Set<FoodType> {
  const foods = new Set<FoodType>();
  for (const p of opponents(ctx)) for (const f of collectedBy(p)) foods.add(f);
  return foods;
}

/**
 * แมวดำเจ้าเล่ห์ — tries to clash with the leader's likely bid, otherwise takes a
 * number nobody else has left; eats foods others are collecting before they can;
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
      if (mine.includes(guess) && rng.next() < 0.7) return guess;
    }
    // A number no opponent still holds can never clash.
    const safe = mine.filter((v) => rivals.every((p) => !p.meowLeft.includes(v)));
    if (safe.length > 0) return safe.at(-1)!;
    return mine[Math.floor(mine.length / 2)]!;
  },

  pick: (ctx) => {
    const { view } = ctx;
    // Hate-draft: a food an opponent is visibly collecting is worth a bit more.
    const rivals = opponents(ctx);
    return bestPick(ctx, (card) => {
      if (!isFood(card.kind)) return 0;
      const kind = card.kind;
      const collectors = rivals.filter((p) => countKind(p.picks, kind) >= 2).length;
      return collectors * 0.3 * view.prices[kind];
    });
  },

  keepDigging: ({ view }) => dogRisk(view) <= 0.27,
  throwBone: ({ view }) => view.bag.length >= 2,

  meal: (ctx) => {
    const contested = contestedFoods(ctx);
    // Eat what others are collecting first, so the price drops before their turn.
    return rankedMeals(ctx.view, (f) => contested.has(f))[0] ?? patientMeal(ctx.view);
  },

  discard: (ctx) => cheapestDiscards(ctx, 0.5),
};
