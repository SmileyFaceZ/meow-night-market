import type {
  Action,
  BotDifficulty,
  BotPersonality,
  GameEvent,
  PlayerId,
  PlayerView,
} from '@meow/engine';
import type { Handoff } from './handoff';

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
  /** Total events emitted so far — lets the UI tell which of `recentEvents` are new. */
  readonly eventCount: number;
  /** Increases on every change, so React can cheaply tell snapshots apart. */
  readonly version: number;
  /** Several humans share this screen (pass-and-play): say names, never "you". */
  readonly sharedDevice: boolean;
  /** Pass-and-play: the device should go to someone else before they can act. */
  readonly handoff: Handoff | null;
}

/**
 * One interface for every mode (docs/ARCHITECTURE.md): the game screen never knows
 * whether the engine runs locally or on a server.
 */
export interface GameController {
  readonly getSnapshot: () => ControllerSnapshot;
  readonly subscribe: (listener: () => void) => () => void;
  /** Returns an i18n key explaining why the action was refused, or null if it was played. */
  readonly dispatch: (action: Action) => string | null;
  /**
   * While the UI is still showing events (animations, messages), the game holds:
   * bots and automatic moves wait until it is unpaused.
   */
  readonly setPaused: (paused: boolean) => void;
  /** Pass-and-play: the player named in `handoff` has taken the device. */
  readonly acceptHandoff?: () => void;
  readonly dispose: () => void;
}
