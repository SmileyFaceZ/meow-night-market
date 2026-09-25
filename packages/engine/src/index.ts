// Public API of the game engine (pure TypeScript — see CLAUDE.md hard rules 1–3).
export { DEFAULT_CONFIG, FOOD_TYPES, validateConfig } from './config.ts';
export type { EventConfig, GameConfig } from './config.ts';
export * from './types.ts';
export { createRng, hashSeed, normalizeSeed } from './rng.ts';
export type { Rng } from './rng.ts';
export { createGame } from './setup.ts';
export type { CreateGameOptions } from './setup.ts';
export { applyAction } from './actions.ts';
export { getPlayerView } from './view.ts';
export type { PlayerView, PublicPlayer } from './view.ts';
export { scoreGame } from './scoring.ts';
export { checkMeal, findMealOptions, foodCopiesFor, isFood, totalCardCount } from './cards.ts';
export type { MealCheck, MealOption } from './cards.ts';
export {
  canDigTrash,
  computeTurnOrder,
  currentPlayer,
  marketSize,
  pendingActors,
} from './rules.ts';
export {
  CAT_IDS,
  CAT_POWER,
  canUsePowerNow,
  hasEatingChoice,
  pairOptions,
  POWER_IDS,
  scavengeable,
  secondThoughtValues,
  topFoodInBin,
  unusedPower,
} from './powers.ts';
export type { CatId, Peek, PowerId, PowerState, PowerUse, PowerWindow } from './powers.ts';
export { POWER_TUNING } from './config.ts';
export { digLimit, EVENT_IDS, eventDeckFor } from './events.ts';
export type { EventId, EventState } from './events.ts';
export { chooseRandomAction } from './bots/random.ts';
export {
  BOT_DIFFICULTIES,
  BOT_PERSONALITIES,
  BOT_TUNING,
  chooseBotAction,
  EASY_MISTAKE_RATE,
} from './bots/index.ts';
export type { BotDifficulty, BotPersonality } from './bots/index.ts';
