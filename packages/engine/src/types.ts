import type { FoodType, GameConfig } from './config.ts';
import type { EventId, EventState } from './events.ts';
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
 * bidding → pick → trash → (pass) → eat → discard → next round … → gameOver
 * `pick` and `discard` are skipped when nobody has anything to do in them;
 * `pass` only happens under the Gusty Wind event (GAME_RULES §15).
 */
export type Phase = 'bidding' | 'pick' | 'trash' | 'pass' | 'eat' | 'discard' | 'gameOver';

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

  // ── Market events (GAME_RULES §15) — null / empty without events ──
  readonly events: EventState | null;
  /** Downpour: dogs out of the bin until the round ends. */
  readonly setAsideDogs: readonly Card[];
  /** Blackout: stall cards lying face down (their kind is secret). */
  readonly faceDown: readonly CardId[];
  /** Sleepy Dogs: who met the round's first (sleeping) dog — empty until then. */
  readonly dogsSlept: readonly PlayerId[];
  /** Gusty Wind: the card each player passes on — secret until everyone has chosen. */
  readonly passes: Readonly<Record<PlayerId, CardId | null>>;
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
  /** Gusty Wind: the card to pass to the next seat (chosen in secret). */
  | { readonly type: 'passCard'; readonly playerId: PlayerId; readonly cardId: CardId };

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
      /** Face-up stall cards. */
      readonly market: readonly Card[];
      /** Blackout: how many more lie face down. */
      readonly faceDown: number;
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
    }
  // ── Market events ──
  /** This round's market event, shown before the stall is laid out. */
  | { readonly type: 'EVENT_REVEALED'; readonly round: number; readonly event: EventId }
  /** Downpour: dogs leave the bin for the round (and come back at its end). */
  | { readonly type: 'DOGS_SET_ASIDE'; readonly count: number }
  | { readonly type: 'DOGS_BACK'; readonly count: number }
  /** Kind Vendor: a free card from the bin. */
  | { readonly type: 'VENDOR_GIFT'; readonly playerId: PlayerId; readonly card: Card }
  /** Sleepy Dogs: this dog was asleep — back into the bin, no harm done. */
  | { readonly type: 'DOG_SLEPT'; readonly playerId: PlayerId }
  /** Full Moon: spent powers are back. */
  | { readonly type: 'POWERS_RESTORED'; readonly playerIds: readonly PlayerId[] }
  /** Gusty Wind: someone has chosen what to pass (which card stays secret for now). */
  | { readonly type: 'PASS_CHOSEN'; readonly playerId: PlayerId }
  | {
      readonly type: 'CARDS_PASSED';
      readonly passes: readonly {
        readonly from: PlayerId;
        readonly to: PlayerId;
        readonly card: Card;
      }[];
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
  'error.digLimit',
  'error.noPassNeeded',
  'error.alreadyPassed',
] as const;
export type ErrorKey = (typeof ERROR_KEYS)[number];

export type ActionResult =
  | { readonly ok: true; readonly state: GameState; readonly events: readonly GameEvent[] }
  | { readonly ok: false; readonly error: ErrorKey };
