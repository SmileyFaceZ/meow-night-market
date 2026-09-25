import { type GameState, pendingActors, type PlayerId } from '@meow/engine';
import type { SeatInfo } from './types';

// Pass-and-play (docs/ROADMAP.md › เฟส 5): several humans share one screen. The screen
// always shows one player's view — the "holder" — and a cover asks to pass the device
// whenever someone else has to act.

export interface Handoff {
  /** Who should take the device next. */
  readonly to: PlayerId;
  /**
   * Their move is secret (a bid, or hand-limit discards before the reveal — GAME_RULES §8),
   * so the cover goes up at once. Open moves wait until the screen has finished showing events.
   */
  readonly secret: boolean;
}

export function isSecretPhase(phase: GameState['phase']): boolean {
  return phase === 'bidding' || phase === 'discard';
}

/** The last meow card is the only legal bid: the app plays it, nobody needs the device. */
export function isForcedBid(state: GameState, id: PlayerId): boolean {
  const player = state.players.find((p) => p.id === id);
  return state.phase === 'bidding' && player?.meowLeft.length === 1;
}

/** Humans the game is waiting on, in seat order (bots and forced bids excluded). */
export function humansToAct(state: GameState, seats: readonly SeatInfo[]): PlayerId[] {
  return pendingActors(state).filter(
    (id) => seats.some((s) => s.id === id && !s.bot) && !isForcedBid(state, id),
  );
}

/**
 * Who needs the device now. Null keeps it with the current holder: they still have
 * something to do, or only bots are playing.
 */
export function nextHandoff(
  state: GameState,
  seats: readonly SeatInfo[],
  holder: PlayerId,
): Handoff | null {
  const waiting = humansToAct(state, seats);
  if (waiting.length === 0 || waiting.includes(holder)) return null;
  return { to: waiting[0]!, secret: isSecretPhase(state.phase) };
}
