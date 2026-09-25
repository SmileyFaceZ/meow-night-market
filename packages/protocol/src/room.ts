import type { BotDifficulty, BotPersonality, PlayerId } from '@meow/engine';

// Online rooms (docs/MULTIPLAYER.md). Numbers here are the single place to tune them.

/** Room codes avoid look-alikes (no I, L, O — and no digits at all, so no 0/1). */
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ';
export const ROOM_CODE_LENGTH = 4;
export const ROOM_CODE_PATTERN = new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`);

export const MAX_SEATS = 4;
export const MIN_SEATS_TO_START = 2;
export const MAX_SPECTATORS = 4;
export const NAME_MAX_LENGTH = 12;

/** Per-turn timer choices in seconds (0 = off). */
export const TURN_SECONDS_OPTIONS = [0, 30, 45, 60, 90] as const;
export type TurnSeconds = (typeof TURN_SECONDS_OPTIONS)[number];
export const DEFAULT_TURN_SECONDS: TurnSeconds = 45;

/** A player who drops out gets a stand-in bot after this long. */
export const DISCONNECT_GRACE_MS = 60_000;
/** The personality that stands in for a player who dropped out or ran out of time. */
export const STAND_IN_BOT = { personality: 'careful', difficulty: 'normal' } as const;
/** Rooms nobody is connected to are deleted after this long. */
export const EMPTY_ROOM_TTL_MS = 30 * 60_000;

/** Bots "think" this long (GAME_RULES §9), after the screen has shown the last events. */
export const BOT_DELAY_MS = { min: 600, max: 1200 } as const;
/** The last meow card is bid for a human after this pause. */
export const AUTO_MOVE_MS = 700;

/** Spam guard: at most this many messages per window per connection. */
export const RATE_LIMIT = { messages: 30, windowMs: 10_000 } as const;
/** One sticker per player at most this often. */
export const EMOTE_COOLDOWN_MS = 1_500;
/** Bigger messages are dropped before parsing. */
export const MAX_MESSAGE_BYTES = 4_096;

/** Cat stickers: a fixed set, no free text (nothing to moderate). */
export const EMOTES = ['meow', 'yay', 'yum', 'wow', 'oops', 'hurry', 'thanks', 'gg'] as const;
export type EmoteId = (typeof EMOTES)[number];

export const CAT_COLORS = ['orange', 'black', 'white', 'calico'] as const;
export type CatColor = (typeof CAT_COLORS)[number];

export interface RoomBot {
  readonly personality: BotPersonality;
  readonly difficulty: BotDifficulty;
}

/** A seat as every client sees it. */
export interface RoomSeat {
  readonly id: PlayerId;
  /** Humans' nickname; bots have none (their name comes from i18n). */
  readonly name: string | null;
  readonly cat: CatColor;
  readonly bot: RoomBot | null;
  readonly host: boolean;
  /** Humans: has a live connection. Bots: always true. */
  readonly connected: boolean;
  /** A bot is playing for this human (dropped out) until they come back. */
  readonly standIn: boolean;
}

export type RoomStatus = 'lobby' | 'playing' | 'ended';

export interface RoomInfo {
  readonly code: string;
  readonly status: RoomStatus;
  readonly seats: readonly RoomSeat[];
  readonly turnSeconds: TurnSeconds;
  readonly spectators: number;
  /** The receiving client's seat, or null when watching. */
  readonly you: PlayerId | null;
}

/** Someone the game is waiting on, and how long they have left (ms; null = no timer). */
export interface TurnClock {
  readonly playerId: PlayerId;
  readonly remainingMs: number | null;
}
