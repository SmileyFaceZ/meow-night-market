import type {
  Action,
  BotDifficulty,
  BotPersonality,
  GameEvent,
  PlayerId,
  PlayerView,
} from '@meow/engine';
import type { CatColor, EmoteId, GameSpeed } from '@meow/protocol';
import type { Handoff } from './handoff';

// Shared with the online server, so a cat or a name means the same thing everywhere.
export { CAT_COLORS, type CatColor, NAME_MAX_LENGTH } from '@meow/protocol';

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
  /** Online play only. */
  readonly online?: OnlineExtras;
}

export type Presence = 'away' | 'standIn';

export interface ShownEmote {
  readonly key: number;
  readonly from: PlayerId;
  readonly id: EmoteId;
}

/** What the game screen shows only when playing online. */
export interface OnlineExtras {
  /** Players on the clock; `deadline` is local time in ms (null = no timer). */
  readonly clocks: readonly { readonly playerId: PlayerId; readonly deadline: number | null }[];
  /** Stickers on screen right now. */
  readonly emotes: readonly ShownEmote[];
  /** Humans who dropped out (missing = here). */
  readonly presence: Readonly<Record<PlayerId, Presence>>;
  /** Watching without a seat. */
  readonly spectating: boolean;
  /** The room's game speed (the host picks it). */
  readonly speed: GameSpeed;
  /** Local time (ms) before which nobody may act: everyone is reading an announcement. */
  readonly openAt: number;
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
  /** Online: send a cat sticker. */
  readonly emote?: (id: EmoteId) => void;
  /** Pass-and-play: the player named in `handoff` has taken the device. */
  readonly acceptHandoff?: () => void;
  readonly dispose: () => void;
}
