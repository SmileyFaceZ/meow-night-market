import type { FoodType, GameConfig } from './config.ts';
import { canDigTrash, currentPlayer } from './rules.ts';
import type { Card, CardId, GameResult, GameState, Meal, Phase, PlayerId } from './types.ts';

export interface PublicPlayer {
  readonly id: PlayerId;
  readonly seat: number;
  readonly meowLeft: readonly number[];
  /** Hands are open information (GAME_RULES §8): every card enters and leaves a hand face-up. */
  readonly hand: readonly Card[];
  readonly handCount: number;
  readonly meals: readonly Meal[];
  readonly mealPoints: number;
  /** Bidding: has chosen a meow card (the value stays secret until everyone has). */
  readonly hasBid: boolean;
  /** This round's bid once revealed, else null. */
  readonly revealedBid: number | null;
  readonly clashed: boolean;
  /** Discard phase: cards this player must throw away (0 = none). */
  readonly mustDiscard: number;
  /** Discard phase: has chosen (the cards stay secret until everyone has). */
  readonly hasDiscarded: boolean;
}

/**
 * Everything one seat is allowed to know (GAME_RULES §8). This is the ONLY thing
 * a UI or network client may receive. `viewer: null` = spectator.
 */
export interface PlayerView {
  readonly viewer: PlayerId | null;
  readonly config: GameConfig;
  readonly round: number;
  readonly phase: Phase;
  /** This round's tie-break order for equal bids — public before bidding. */
  readonly tieOrder: readonly PlayerId[];
  readonly players: readonly PublicPlayer[];
  readonly prices: Readonly<Record<FoodType, number>>;

  readonly market: readonly Card[];
  readonly marketDeckCount: number;
  readonly trashCount: number;
  /** Dogs always return to the bin, so how many are in it is public. */
  readonly trashDogCount: number;
  readonly discard: readonly Card[];
  /** False only when the bin holds nothing but dogs and the discard pile is empty. */
  readonly trashDiggable: boolean;

  readonly pickQueue: readonly PlayerId[];
  readonly turnOrder: readonly PlayerId[];
  readonly currentPlayer: PlayerId | null;
  readonly bag: readonly Card[];
  readonly pendingDog: Card | null;

  /** The viewer's own secrets. */
  readonly hand: readonly Card[];
  readonly yourBid: number | null;
  readonly yourDiscard: readonly CardId[] | null;

  readonly result: GameResult | null;
}

const copyCards = (cards: readonly Card[]): Card[] => cards.map((c) => ({ ...c }));

export function getPlayerView(state: GameState, viewer: PlayerId | null): PlayerView {
  const me = viewer === null ? undefined : state.players.find((p) => p.id === viewer);
  if (viewer !== null && !me) throw new Error(`unknown player ${viewer}`);

  const discardPhase = state.phase === 'discard';
  const players: PublicPlayer[] = state.players.map((p) => {
    const pendingDiscard = state.pendingDiscards[p.id];
    return {
      id: p.id,
      seat: p.seat,
      meowLeft: [...p.meowLeft],
      hand: copyCards(p.hand),
      handCount: p.hand.length,
      meals: p.meals.map((m) => ({ ...m, cards: copyCards(m.cards) })),
      mealPoints: p.meals.reduce((sum, m) => sum + m.points, 0),
      hasBid: state.phase === 'bidding' && state.bids[p.id] !== null,
      revealedBid: state.revealedBids?.[p.id] ?? null,
      clashed: state.clashed.includes(p.id),
      mustDiscard:
        discardPhase && pendingDiscard !== undefined
          ? Math.max(0, p.hand.length - state.config.handLimit)
          : 0,
      hasDiscarded: discardPhase && pendingDiscard !== undefined && pendingDiscard !== null,
    };
  });

  return {
    viewer,
    config: state.config,
    round: state.round,
    phase: state.phase,
    tieOrder: [...state.tieOrder],
    players,
    prices: { ...state.prices },
    market: copyCards(state.market),
    marketDeckCount: state.marketDeck.length,
    trashCount: state.trashDeck.length,
    trashDogCount: state.trashDeck.filter((c) => c.kind === 'dog').length,
    discard: copyCards(state.discard),
    trashDiggable: canDigTrash(state),
    pickQueue: [...state.pickQueue],
    turnOrder: [...state.turnOrder],
    currentPlayer: currentPlayer(state),
    bag: copyCards(state.bag),
    pendingDog: state.pendingDog ? { ...state.pendingDog } : null,
    hand: me ? copyCards(me.hand) : [],
    yourBid: me && state.phase === 'bidding' ? (state.bids[me.id] ?? null) : null,
    yourDiscard: me ? (state.pendingDiscards[me.id]?.slice() ?? null) : null,
    result: state.result,
  };
}
