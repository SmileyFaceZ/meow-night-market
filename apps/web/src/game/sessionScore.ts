import type { GameResult, PlayerId } from '@meow/engine';
import type { SeatInfo } from './types';

// Wins across games in a row on this device (GAME_RULES §13 › เดี่ยว / เครื่องเดียว).
// Kept for the browser tab only; a different line-up (players, bots) starts from zero,
// changing only the game mode keeps counting.

export interface SessionScore {
  readonly lineup: string;
  readonly games: number;
  readonly wins: Readonly<Record<PlayerId, number>>;
}

export interface SessionStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const KEY = 'mnm.session.v1';

/** Who sits where: names for people, personality + difficulty for bots. */
export function lineupOf(seats: readonly SeatInfo[]): string {
  return seats
    .map((s) =>
      s.bot ? `${s.id}:bot:${s.bot.personality}:${s.bot.difficulty}` : `${s.id}:${s.name ?? ''}`,
    )
    .join('|');
}

export function readSessionScore(
  storage: SessionStorageLike | null,
  seats: readonly SeatInfo[],
): SessionScore {
  const lineup = lineupOf(seats);
  const empty: SessionScore = { lineup, games: 0, wins: {} };
  try {
    const raw = storage?.getItem(KEY);
    if (!raw) return empty;
    const data = JSON.parse(raw) as Partial<SessionScore>;
    if (data.lineup !== lineup || typeof data.games !== 'number' || typeof data.wins !== 'object') {
      return empty;
    }
    return { lineup, games: data.games, wins: { ...data.wins } };
  } catch {
    return empty;
  }
}

/** Adds one finished game; call once per game. */
export function recordSessionGame(
  storage: SessionStorageLike | null,
  seats: readonly SeatInfo[],
  result: GameResult,
): SessionScore {
  const before = readSessionScore(storage, seats);
  const wins: Record<PlayerId, number> = { ...before.wins };
  for (const id of result.winners) wins[id] = (wins[id] ?? 0) + 1;
  const after: SessionScore = { lineup: before.lineup, games: before.games + 1, wins };
  try {
    storage?.setItem(KEY, JSON.stringify(after));
  } catch {
    // no storage: the score simply does not carry over
  }
  return after;
}

export function browserSessionStorage(): SessionStorageLike | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
