import type { Rng } from '../rng.ts';
import type { Action } from '../types.ts';
import type { PlayerView } from '../view.ts';
import { careful } from './careful.ts';
import { type BotPolicy, runPolicy } from './common.ts';
import { greedy } from './greedy.ts';
import { chooseRandomAction } from './random.ts';
import { sly } from './sly.ts';

export { BOT_TUNING } from './tuning.ts';

export const BOT_PERSONALITIES = ['greedy', 'sly', 'careful'] as const;
export type BotPersonality = (typeof BOT_PERSONALITIES)[number];

export const BOT_DIFFICULTIES = ['easy', 'normal'] as const;
export type BotDifficulty = (typeof BOT_DIFFICULTIES)[number];

/** GAME_RULES §9: easy bots make a random (legal) decision this often. */
export const EASY_MISTAKE_RATE = 0.3;

const POLICIES: Record<BotPersonality, BotPolicy> = { greedy, sly, careful };

/**
 * GAME_RULES §9: `chooseAction(view, rng) → action`. Sees only the player view.
 * Returns null when the game is not waiting on this bot.
 */
export function chooseBotAction(
  personality: BotPersonality,
  difficulty: BotDifficulty,
  view: PlayerView,
  rng: Rng,
): Action | null {
  if (difficulty === 'easy' && rng.next() < EASY_MISTAKE_RATE) {
    return chooseRandomAction(view, rng);
  }
  return runPolicy(POLICIES[personality], view, rng);
}
