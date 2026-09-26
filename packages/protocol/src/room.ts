import {
  type BotDifficulty,
  type BotPersonality,
  CAT_IDS,
  type CatId,
  type PlayerId,
} from '@meow/engine';
import type { GameSpeed } from './pacing.ts';

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
/**
 * A finished game nobody asks to play again for this long counts as an empty room
 * (the EMPTY_ROOM_TTL_MS countdown starts; anyone doing something stops it) — GAME_RULES §13.
 */
export const RESULT_IDLE_MS = 10 * 60_000;

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

/** The 8 cats (GAME_RULES §14) — one per seat, never two alike in a game. */
export const CAT_COLORS = CAT_IDS;
export type CatColor = CatId;

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
  /** After a game: wants to play again (bots always do). */
  readonly ready: boolean;
  /** Games won in this room (GAME_RULES §13 › สกอร์ประจำห้อง). */
  readonly wins: number;
  /**
   * Not playing the current game (was not ready when it started): watching as a spectator,
   * or waiting in the room when the spectator places were full.
   */
  readonly sittingOut: SittingOut | null;
}

export type SittingOut = 'watching' | 'waiting';

export type RoomStatus = 'lobby' | 'playing' | 'ended';

/** Rule set (GAME_RULES §12): classic = both off; Market Mayhem = both on. */
export interface GameMode {
  readonly powers: boolean;
  readonly events: boolean;
}
export const CLASSIC_MODE: GameMode = { powers: false, events: false };
export const MAYHEM_MODE: GameMode = { powers: true, events: true };

export interface RoomInfo {
  readonly code: string;
  readonly status: RoomStatus;
  readonly seats: readonly RoomSeat[];
  readonly turnSeconds: TurnSeconds;
  readonly spectators: number;
  /** The receiving client's seat, or null when watching. */
  readonly you: PlayerId | null;
  /** Games started in this room so far (a rematch starts the next one). */
  readonly gameNo: number;
  /** Rules for the next game (the host sets them between games). */
  readonly mode: GameMode;
  /** How long announcements stay up and how fast bots play (the host's choice). */
  readonly speed?: GameSpeed | undefined;
}

/** Someone the game is waiting on, and how long they have left (ms; null = no timer). */
export interface TurnClock {
  readonly playerId: PlayerId;
  readonly remainingMs: number | null;
}
