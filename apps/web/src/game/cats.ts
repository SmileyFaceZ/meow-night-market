import type { BotPersonality } from '@meow/engine';
import { type BotSeat, CAT_COLORS, type CatColor } from './types';

// Every seat has its own cat (GAME_RULES §14 — never two alike in a game).

/** A bot's own cat, matching its classic name (Greedy Ginger…), when it is free. */
export const BOT_CAT: Record<BotPersonality, CatColor> = {
  greedy: 'orange',
  sly: 'black',
  careful: 'white',
};

/**
 * Cats for the bots, given the ones people already took. Classic: each bot keeps its own
 * cat when free. With `random` (cat powers — the cat is the power), a random free cat.
 */
export function botCats(
  taken: readonly CatColor[],
  bots: readonly BotSeat[],
  random?: () => number,
): CatColor[] {
  const used = new Set(taken);
  return bots.map((bot) => {
    const free = CAT_COLORS.filter((c) => !used.has(c));
    const own = BOT_CAT[bot.personality];
    const cat = random ? free[Math.floor(random() * free.length)]! : used.has(own) ? free[0]! : own;
    used.add(cat);
    return cat;
  });
}
