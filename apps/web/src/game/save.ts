import type { GameConfig, GameState, PlayerId } from '@meow/engine';
import { CAT_COLORS, type SeatInfo } from './types';

// Local games (solo and pass-and-play) are saved to localStorage after every action
// (docs/ARCHITECTURE.md › บันทึกเกม) so players can close the tab and continue later.
// One slot: starting any new local game replaces it. (The key keeps its original name.)

const SAVE_KEY = 'mnm.solo.v1';

export interface GameSave {
  readonly v: 1;
  readonly state: GameState;
  readonly seats: readonly SeatInfo[];
  /** Pass-and-play: whoever held the device last (the game reopens behind a cover). */
  readonly viewerId: PlayerId;
  /** RNG state for bot decisions, so a resumed game continues deterministically. */
  readonly botRng: number;
}

/** Minimal storage surface (lets tests use an in-memory map). */
export interface SaveStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function browserStorage(): SaveStorage | null {
  try {
    return window.localStorage;
  } catch {
    return null; // private mode / blocked storage: play on without saving
  }
}

export function writeSave(storage: SaveStorage | null, save: GameSave): void {
  try {
    storage?.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Quota or privacy errors must never break the game.
  }
}

export function clearSave(storage: SaveStorage | null): void {
  try {
    storage?.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}

function isSeat(value: unknown): value is SeatInfo {
  const seat = value as Partial<SeatInfo> | null;
  return (
    typeof seat?.id === 'string' &&
    typeof seat.cat === 'string' &&
    (CAT_COLORS as readonly string[]).includes(seat.cat)
  );
}

/** State fields added after v1 saves were first written, with their classic-game values. */
const CLASSIC_DEFAULTS: Partial<GameState> = {
  powers: null,
  powerWindow: null,
  peek: null,
  digCount: 0,
  extraOrder: null,
};

/** Returns a save only if it looks like one this version wrote; anything else is ignored. */
export function readSave(storage: SaveStorage | null): GameSave | null {
  try {
    const raw = storage?.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as Partial<GameSave>;
    if (data.v !== 1 || !data.state || !Array.isArray(data.seats) || !data.viewerId) return null;
    if (typeof data.botRng !== 'number' || data.state.phase === 'gameOver') return null;
    const seatsOk = (data.seats as unknown[]).every(isSeat);
    const players: unknown = data.state.players;
    if (!Array.isArray(players)) return null;
    const ids = (players as { id?: unknown }[]).map((p) => p.id);
    const playersOk = ids.length === data.seats.length && ids.includes(data.viewerId);
    if (!seatsOk || !playersOk) return null;
    // Saves written before cat powers existed (GAME_RULES §14) are classic games.
    const state = {
      ...CLASSIC_DEFAULTS,
      ...data.state,
      // Older configs lack newer fields.
      config: {
        scavengerTiming: 'eat',
        goodLuckEffect: 'keepDigging',
        ...(data.state.config as Partial<GameConfig>),
      },
    } as GameState;
    return { ...(data as GameSave), state };
  } catch {
    return null;
  }
}
