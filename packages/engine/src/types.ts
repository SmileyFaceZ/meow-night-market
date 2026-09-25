import type { FoodType, GameConfig } from './config.ts';
import type { Peek, PowerId, PowerState, PowerUse, PowerWindow } from './powers.ts';

export type { FoodType } from './config.ts';

export type PlayerId = string;
export type CardId = number;

export type CardKind = FoodType | 'goldfish' | 'bone' | 'dog';

export interface Card {
  readonly id: CardId;
  readonly kind: CardKind;
}

/**
 * Phase machine (docs/ARCHITECTURE.md):
 * bidding → pick → trash → eat → discard → next round … → gameOver
 * `pick` and `discard` are skipped when nobody has anything to do in them.
 */
export type Phase = 'bidding' | 'pick' | 'trash' | 'eat' | 'discard' | 'gameOver';

export interface Meal {
  readonly round: number;
  readonly food: FoodType;
  readonly cards: readonly Card[];
  readonly big: boolean;
  /** Market price when eaten (before the drop). */
  readonly price: number;
  readonly points: number;
}

export interface PlayerState {
  readonly id: PlayerId;
  readonly seat: number;
  /** Meow bid cards not used yet. */
  readonly meowLeft: readonly number[];
  readonly hand: readonly Card[];
  readonly meals: readonly Meal[];
}

export interface ScoreLine {
  readonly playerId: PlayerId;
  readonly mealPoints: number;
  /** Distinct food types eaten (goldfish never counts as a type). */
  readonly foodTypes: number;
  readonly varietyBonus: number;
  readonly total: number;
  readonly handCount: number;
}

export interface GameResult {
  /** Seat order. */
  readonly scores: readonly ScoreLine[];
  /** Everyone sharing first place after tie-breaks. */
  readonly winners: readonly PlayerId[];
}

export interface GameState {
  readonly config: GameConfig;
  /** Serialised RNG state — the only source of randomness. */
  readonly rng: number;
  readonly players: readonly PlayerState[];
  readonly round: number;
  readonly phase: Phase;
  /** This round's tie-break order, drawn at the start of the round and public (GAME_RULES §4.1). */
  readonly tieOrder: readonly PlayerId[];
  readonly prices: Readonly<Record<FoodType, number>>;

  readonly marketDeck: readonly Card[];
  readonly market: readonly Card[];
  readonly trashDeck: readonly Card[];
  /** Face-up; public. */
  readonly discard: readonly Card[];

  /** Secret until everyone has bid. null = not yet chosen. */
  readonly bids: Readonly<Record<PlayerId, number | null>>;
  /** Bids of this round once revealed (null while bidding). */
  readonly revealedBids: Readonly<Record<PlayerId, number>> | null;
  /** Players who clashed this round. */
  readonly clashed: readonly PlayerId[];
  /** Pick order: unique bidders (highest bid first), then clashed players in turn order. */
  readonly pickQueue: readonly PlayerId[];

  /** Trash + eat turn order for this round. */
  readonly turnOrder: readonly PlayerId[];
  /** Index into turnOrder during trash / eat. */
  readonly turnIndex: number;
  /** Temporary bag of the player currently digging. */
  readonly bag: readonly Card[];
  /** A drawn guard dog waiting for the digger to decide whether to throw a bone. */
  readonly pendingDog: Card | null;

  /** Secret until everyone who must discard has chosen. */
  readonly pendingDiscards: Readonly<Record<PlayerId, readonly CardId[] | null>>;

  readonly result: GameResult | null;

  // ── Cat powers (GAME_RULES §14) — null / empty in classic games ──
  /** Each player's cat and whether its power is spent. null = classic game (no powers). */
  readonly powers: Readonly<Record<PlayerId, PowerState>> | null;
  /** The game waits for one player to use a power or let it pass. */
  readonly powerWindow: PowerWindow | null;
  /** Keen Nose: what the sniffer knows about the top of the bin (secret). */
  readonly peek: Peek | null;
  /** Cards drawn so far in the current Trash Dig turn. */
  readonly digCount: number;
  /** Extra Order: this player gets the stall's leftover card after everyone has picked. */
  readonly extraOrder: PlayerId | null;
}

export type Action =
  | { readonly type: 'bid'; readonly playerId: PlayerId; readonly value: number }
  | { readonly type: 'pick'; readonly playerId: PlayerId; readonly cardId: CardId }
  | { readonly type: 'dig'; readonly playerId: PlayerId }
  | { readonly type: 'resolveDog'; readonly playerId: PlayerId; readonly useBone: boolean }
  | { readonly type: 'stop'; readonly playerId: PlayerId }
  | { readonly type: 'eat'; readonly playerId: PlayerId; readonly cardIds: readonly CardId[] }
  | { readonly type: 'finishEating'; readonly playerId: PlayerId }
  | { readonly type: 'discard'; readonly playerId: PlayerId; readonly cardIds: readonly CardId[] }
  /** Use your cat's power (GAME_RULES §14); the payload depends on the power. */
  | { readonly type: 'usePower'; readonly playerId: PlayerId; readonly use: PowerUse }
  /** Let an open power window pass without using the power. */
  | { readonly type: 'passPower'; readonly playerId: PlayerId }
  /** Keen Nose: send one of the two sniffed cards to the bottom of the bin (or neither). */
  | { readonly type: 'sniff'; readonly playerId: PlayerId; readonly bottomCardId: CardId | null };

export type ActionType = Action['type'];

/**
 * Events describe what happened, in order, so the UI can animate it.
 * Every event is PUBLIC information — safe to broadcast to all players.
 */
export type GameEvent =
  | {
      readonly type: 'ROUND_STARTED';
      readonly round: number;
      readonly tieOrder: readonly PlayerId[];
      readonly market: readonly Card[];
    }
  | { readonly type: 'BID_PLACED'; readonly playerId: PlayerId }
  | { readonly type: 'BIDS_REVEALED'; readonly bids: Readonly<Record<PlayerId, number>> }
  | { readonly type: 'BID_CLASH'; readonly value: number; readonly playerIds: readonly PlayerId[] }
  | { readonly type: 'CARD_PICKED'; readonly playerId: PlayerId; readonly card: Card }
  | { readonly type: 'MARKET_CLEARED'; readonly cards: readonly Card[] }
  | {
      readonly type: 'PHASE_STARTED';
      readonly phase: Phase;
      readonly turnOrder: readonly PlayerId[];
    }
  | { readonly type: 'TURN_STARTED'; readonly playerId: PlayerId }
  /** Feast Time: the player had no meal to eat, so their turn passed automatically. */
  | { readonly type: 'TURN_SKIPPED'; readonly playerId: PlayerId }
  | { readonly type: 'TRASH_RESHUFFLED'; readonly count: number }
  | {
      readonly type: 'CARD_DUG';
      readonly playerId: PlayerId;
      readonly card: Card;
      readonly to: 'bag' | 'hand' | 'dog';
    }
  | { readonly type: 'DOG_APPEARED'; readonly playerId: PlayerId; readonly canThrowBone: boolean }
  | { readonly type: 'BONE_THROWN'; readonly playerId: PlayerId; readonly bone: Card }
  | { readonly type: 'DOG_CAUGHT'; readonly playerId: PlayerId; readonly lost: readonly Card[] }
  | { readonly type: 'DOG_RETURNED' }
  | { readonly type: 'BAG_KEPT'; readonly playerId: PlayerId; readonly cards: readonly Card[] }
  | {
      readonly type: 'MEAL_EATEN';
      readonly playerId: PlayerId;
      readonly meal: Meal;
      readonly newPrice: number;
    }
  | { readonly type: 'DISCARD_CHOSEN'; readonly playerId: PlayerId }
  | {
      readonly type: 'CARDS_DISCARDED';
      readonly playerId: PlayerId;
      readonly cards: readonly Card[];
    }
  | { readonly type: 'GAME_OVER'; readonly result: GameResult }
  // ── Cat powers ──
  /** Someone used their power (everyone sees the sparkle and the power's name). */
  | { readonly type: 'POWER_USED'; readonly playerId: PlayerId; readonly power: PowerId }
  /** A power window opened: the game waits for this player to decide. */
  | { readonly type: 'POWER_WINDOW'; readonly playerId: PlayerId; readonly power: PowerId }
  /** Keen Nose done. Which card moved stays secret; only whether one did. */
  | { readonly type: 'SNIFFED'; readonly playerId: PlayerId; readonly movedToBottom: boolean }
  | {
      readonly type: 'BID_CHANGED';
      readonly playerId: PlayerId;
      readonly from: number;
      readonly to: number;
    }
  | { readonly type: 'CARD_SCAVENGED'; readonly playerId: PlayerId; readonly card: Card }
  | {
      readonly type: 'MARKET_SWAPPED';
      readonly playerId: PlayerId;
      readonly out: Card;
      readonly in: Card;
    }
  | {
      readonly type: 'PRICE_CHANGED';
      readonly food: FoodType;
      readonly from: number;
      readonly to: number;
    };

/** Error keys double as i18n keys (apps/web/src/i18n). */
export const ERROR_KEYS = [
  'error.gameOver',
  'error.wrongPhase',
  'error.notYourTurn',
  'error.unknownPlayer',
  'error.alreadyBid',
  'error.meowUsed',
  'error.cardNotInMarket',
  'error.dogPending',
  'error.noDogPending',
  'error.noBone',
  'error.trashEmpty',
  'error.cardNotInHand',
  'error.duplicateCard',
  'error.invalidMeal',
  'error.noDiscardNeeded',
  'error.alreadyDiscarded',
  'error.wrongDiscardCount',
  'error.noPower',
  'error.powerNotNow',
  'error.powerPending',
  'error.invalidPowerTarget',
] as const;
export type ErrorKey = (typeof ERROR_KEYS)[number];

export type ActionResult =
  | { readonly ok: true; readonly state: GameState; readonly events: readonly GameEvent[] }
  | { readonly ok: false; readonly error: ErrorKey };
