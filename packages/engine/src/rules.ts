import type { GameState, PlayerId, PlayerState } from './types.ts';

export function marketSize(state: Pick<GameState, 'config' | 'players'>): number {
  return state.players.length + state.config.marketExtra;
}

/** GAME_RULES §3.7: the start player moves one seat clockwise every round. */
export function startSeatForRound(
  firstStartSeat: number,
  round: number,
  playerCount: number,
): number {
  return (firstStartSeat + round - 1) % playerCount;
}

export function startPlayer(state: GameState): PlayerId {
  const seat = startSeatForRound(state.firstStartSeat, state.round, state.players.length);
  return (state.players[seat] as PlayerState).id;
}

/**
 * GAME_RULES §5: everyone (clashed players included) ordered by this round's bid, lowest first.
 * Equal bids: seat order counting the round's start player first, then clockwise.
 */
export function computeTurnOrder(
  players: readonly PlayerState[],
  bids: Readonly<Record<PlayerId, number>>,
  startSeat: number,
): PlayerId[] {
  const n = players.length;
  const seatRank = (p: PlayerState) => (p.seat - startSeat + n) % n;
  return [...players]
    .sort((a, b) => (bids[a.id] ?? 0) - (bids[b.id] ?? 0) || seatRank(a) - seatRank(b))
    .map((p) => p.id);
}

/** Whose turn it is in the turn-based phases (pick / trash / eat); null otherwise. */
export function currentPlayer(state: GameState): PlayerId | null {
  switch (state.phase) {
    case 'pick':
      return state.pickQueue[0] ?? null;
    case 'trash':
    case 'eat':
      return state.turnOrder[state.turnIndex] ?? null;
    default:
      return null;
  }
}

/** Players the game is waiting on right now (several at once in the simultaneous phases). */
export function pendingActors(state: GameState): PlayerId[] {
  switch (state.phase) {
    case 'bidding':
      return state.players.filter((p) => state.bids[p.id] === null).map((p) => p.id);
    case 'discard':
      return state.players.filter((p) => state.pendingDiscards[p.id] === null).map((p) => p.id);
    case 'gameOver':
      return [];
    default: {
      const current = currentPlayer(state);
      return current === null ? [] : [current];
    }
  }
}

/** GAME_RULES §5: digging is impossible only when the bin holds nothing but dogs and the discard pile is empty. */
export function canDigTrash(state: Pick<GameState, 'trashDeck' | 'discard'>): boolean {
  return state.trashDeck.some((c) => c.kind !== 'dog') || state.discard.length > 0;
}
