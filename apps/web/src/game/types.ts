import type {
  Action,
  BotDifficulty,
  BotPersonality,
  ErrorKey,
  GameEvent,
  PlayerId,
  PlayerView,
} from '@meow/engine';

export const CAT_COLORS = ['orange', 'black', 'white', 'calico'] as const;
export type CatColor = (typeof CAT_COLORS)[number];

export const NAME_MAX_LENGTH = 12;

export interface BotSeat {
  readonly personality: BotPersonality;
  readonly difficulty: BotDifficulty;
}

/** Everything the UI knows about a seat besides the engine's player state. */
export interface SeatInfo {
  readonly id: PlayerId;
  /** Nickname typed by a human. Bots have none — their name comes from i18n (`bot.<personality>`). */
  readonly name: string | null;
  readonly cat: CatColor;
  readonly bot: BotSeat | null;
}

export interface ControllerSnapshot {
  readonly view: PlayerView;
  readonly seats: readonly SeatInfo[];
  /** Events of the most recent actions, oldest first (for the feed / animations). */
  readonly recentEvents: readonly GameEvent[];
  /** Increases on every change, so React can cheaply tell snapshots apart. */
  readonly version: number;
}

/**
 * One interface for every mode (docs/ARCHITECTURE.md): the game screen never knows
 * whether the engine runs locally or on a server.
 */
export interface GameController {
  readonly getSnapshot: () => ControllerSnapshot;
  readonly subscribe: (listener: () => void) => () => void;
  /** Returns an i18n error key if the engine refused the action. */
  readonly dispatch: (action: Action) => ErrorKey | null;
  readonly dispose: () => void;
}
