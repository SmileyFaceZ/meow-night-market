import type { FoodType, GameConfig } from './config.ts';
import { CAT_POWER, type CatId, canUsePowerNow, type PowerId, type PowerWindow } from './powers.ts';
import { digLimit, type EventId } from './events.ts';
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
  /** Cat powers mode: this player's cat and power (null in classic games). */
  readonly cat: CatId | null;
  readonly power: PowerId | null;
  /** Spent powers are public (the icon turns grey). */
  readonly powerUsed: boolean;
  /** Gusty Wind: must choose a card to pass / has chosen (which one stays secret). */
  readonly mustPass: boolean;
  readonly hasPassed: boolean;
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

  /** Face-up stall cards. */
  readonly market: readonly Card[];
  /** Blackout: stall cards lying face down — only their ids (pick them blind). */
  readonly faceDownMarket: readonly CardId[];
  readonly marketDeckCount: number;
  readonly trashCount: number;
  /** Dogs always return to the bin, so how many are in it is public. */
  readonly trashDogCount: number;
  readonly discard: readonly Card[];
  /**
   * False when the bin holds nothing but dogs and the discard pile is empty, or (Garbage
   * Truck) the digger has drawn as many cards as allowed this turn.
   */
  readonly trashDiggable: boolean;
  /** Garbage Truck: most cards per Trash Dig turn this round (null = no limit). */
  readonly digLimit: number | null;

  /** Market events (GAME_RULES §15). */
  readonly eventsOn: boolean;
  readonly event: EventId | null;
  readonly pastEvents: readonly EventId[];
  /** Events still to come (their order is secret). */
  readonly eventsLeft: number;
  /** Downpour: dogs out of the bin this round. */
  readonly dogsSheltering: number;
  /** Sleepy Dogs: players whose first dog already slept this round. */
  readonly dogsSlept: readonly PlayerId[];

  readonly pickQueue: readonly PlayerId[];
  readonly turnOrder: readonly PlayerId[];
  readonly currentPlayer: PlayerId | null;
  readonly bag: readonly Card[];
  readonly pendingDog: Card | null;

  /** Cat powers (GAME_RULES §14). */
  readonly powersOn: boolean;
  /** The game waits for this player to use a power or let it pass. */
  readonly powerWindow: PowerWindow | null;
  /** Someone is sniffing the bin with Keen Nose (what they see is theirs alone). */
  readonly sniffing: PlayerId | null;
  /** Extra Order: this player also gets the stall's leftover card. */
  readonly extraOrder: PlayerId | null;
  /** Cards drawn so far in the current Trash Dig turn. */
  readonly digCount: number;

  /** The viewer's own secrets. */
  readonly hand: readonly Card[];
  /** Keen Nose: the top of the bin as the viewer knows it (only for the sniffer). */
  readonly peek: { readonly cards: readonly Card[]; readonly decided: boolean } | null;
  /** The viewer may use their power right now (the button glows). */
  readonly canUsePower: boolean;
  readonly yourBid: number | null;
  readonly yourDiscard: readonly CardId[] | null;
  /** Gusty Wind: the card you chose to pass (secret until everyone has chosen). */
  readonly yourPass: CardId | null;

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
      cat: state.powers?.[p.id]?.cat ?? null,
      power: state.powers?.[p.id] ? CAT_POWER[state.powers[p.id]!.cat] : null,
      powerUsed: state.powers?.[p.id]?.used ?? false,
      mustPass: state.phase === 'pass' && p.id in state.passes,
      hasPassed: state.phase === 'pass' && state.passes[p.id] != null,
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
    market: copyCards(state.market.filter((c) => !state.faceDown.includes(c.id))),
    faceDownMarket: state.market.filter((c) => state.faceDown.includes(c.id)).map((c) => c.id),
    marketDeckCount: state.marketDeck.length,
    trashCount: state.trashDeck.length,
    trashDogCount: state.trashDeck.filter((c) => c.kind === 'dog').length,
    discard: copyCards(state.discard),
    trashDiggable: canDigTrash(state) && state.digCount < (digLimit(state) ?? Infinity),
    digLimit: digLimit(state),
    eventsOn: state.events !== null,
    event: state.events?.current ?? null,
    pastEvents: [...(state.events?.past ?? [])],
    eventsLeft: state.events?.deck.length ?? 0,
    dogsSheltering: state.setAsideDogs.length,
    dogsSlept: [...state.dogsSlept],
    pickQueue: [...state.pickQueue],
    turnOrder: [...state.turnOrder],
    currentPlayer: currentPlayer(state),
    bag: copyCards(state.bag),
    pendingDog: state.pendingDog ? { ...state.pendingDog } : null,
    powersOn: state.powers !== null,
    powerWindow: state.powerWindow ? { ...state.powerWindow } : null,
    sniffing: state.peek?.playerId ?? null,
    extraOrder: state.extraOrder,
    digCount: state.digCount,
    hand: me ? copyCards(me.hand) : [],
    peek:
      me && state.peek?.playerId === me.id
        ? { cards: copyCards(state.peek.cards), decided: state.peek.decided }
        : null,
    canUsePower: me ? canUsePowerNow(state, me.id) : false,
    yourBid: me && state.phase === 'bidding' ? (state.bids[me.id] ?? null) : null,
    yourDiscard: me ? (state.pendingDiscards[me.id]?.slice() ?? null) : null,
    yourPass: me ? (state.passes[me.id] ?? null) : null,
    result: state.result,
  };
}
