import type { GameState, PlayerId, PlayerState } from './types.ts';

export function marketSize(state: Pick<GameState, 'config' | 'players'>): number {
  return state.players.length + state.config.marketExtra;
}

/**
 * GAME_RULES §5: everyone (clashed players included) ordered by this round's bid, lowest first.
 * Equal bids follow the round's public tie-break order.
 */
export function computeTurnOrder(
  players: readonly PlayerState[],
  bids: Readonly<Record<PlayerId, number>>,
  tieOrder: readonly PlayerId[],
): PlayerId[] {
  const tieRank = (p: PlayerState) => tieOrder.indexOf(p.id);
  return [...players]
    .sort((a, b) => (bids[a.id] ?? 0) - (bids[b.id] ?? 0) || tieRank(a) - tieRank(b))
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
