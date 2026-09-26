import {
  BOT_DIFFICULTIES,
  BOT_PERSONALITIES,
  CAT_IDS,
  EVENT_IDS,
  POWER_IDS,
  ERROR_KEYS,
  FOOD_TYPES,
  type Action,
  type ErrorKey,
  type GameEvent,
  type PlayerView,
} from '@meow/engine';
import { z } from 'zod';
import { GAME_SPEEDS } from './pacing.ts';
import {
  CAT_COLORS,
  type EmoteId,
  EMOTES,
  NAME_MAX_LENGTH,
  ROOM_CODE_PATTERN,
  type RoomInfo,
  TURN_SECONDS_OPTIONS,
  type TurnClock,
} from './room.ts';

// Every message between client and server has a schema, checked on both sides
// (docs/MULTIPLAYER.md › สถาปัตยกรรม). Game shapes mirror @meow/engine; the type checks
// at the bottom of this file fail to compile if the two drift apart.

const id = z.string().min(1).max(16);
const cardId = z.number().int().nonnegative();
const count = z.number().int().nonnegative();

const foodType = z.enum(FOOD_TYPES);
const cardKind = z.enum([...FOOD_TYPES, 'goldfish', 'bone', 'dog']);
const card = z.object({ id: cardId, kind: cardKind });
const cards = z.array(card).max(200);
const phase = z.enum(['bidding', 'pick', 'trash', 'pass', 'eat', 'discard', 'gameOver']);
const eventId = z.enum(EVENT_IDS);
const prices = z.object(
  Object.fromEntries(FOOD_TYPES.map((f) => [f, z.number().int()])) as Record<
    (typeof FOOD_TYPES)[number],
    z.ZodNumber
  >,
);

const meal = z.object({
  round: z.number().int(),
  food: foodType,
  cards,
  big: z.boolean(),
  price: z.number().int(),
  points: z.number().int(),
});

const gameResult = z.object({
  scores: z.array(
    z.object({
      playerId: id,
      mealPoints: z.number().int(),
      foodTypes: count,
      varietyBonus: count,
      total: z.number().int(),
      handCount: count,
    }),
  ),
  winners: z.array(id),
});

const gameConfig = z.object({
  rounds: count,
  meowValues: z.array(z.number().int()),
  foodCopies: z.record(z.string(), count),
  goldfishCopies: count,
  boneCopies: count,
  dogCopies: count,
  marketExtra: count,
  startPrice: count,
  minPrice: count,
  priceDropPerMeal: count,
  mealSize: count,
  bigMealSize: count,
  bigMealMultiplier: count,
  maxWildsPerMeal: count,
  minRealPerMeal: count,
  handLimit: count,
  varietyBonus: count,
  varietyMinTypes: count,
  minPlayers: count,
  maxPlayers: count,
  events: z.object({
    downpourDogs: count,
    seafoodBonus: count,
    garbageTruckDigs: count,
    blackoutCards: count,
  }),
});

const catId = z.enum(CAT_IDS);
const powerId = z.enum(POWER_IDS);
const powerWindow = z.object({
  playerId: id,
  power: z.enum(['luckySwap', 'secondThought']),
});

const publicPlayer = z.object({
  id,
  seat: count,
  meowLeft: z.array(z.number().int()),
  hand: cards,
  handCount: count,
  meals: z.array(meal),
  mealPoints: z.number().int(),
  hasBid: z.boolean(),
  revealedBid: z.number().int().nullable(),
  clashed: z.boolean(),
  mustDiscard: count,
  hasDiscarded: z.boolean(),
  cat: catId.nullable(),
  power: powerId.nullable(),
  powerUsed: z.boolean(),
  mustPass: z.boolean(),
  hasPassed: z.boolean(),
});

export const playerViewSchema = z.object({
  viewer: id.nullable(),
  config: gameConfig,
  round: count,
  phase,
  tieOrder: z.array(id),
  players: z.array(publicPlayer),
  prices,
  market: cards,
  faceDownMarket: z.array(cardId).max(20),
  marketDeckCount: count,
  trashCount: count,
  trashDogCount: count,
  discard: cards,
  trashDiggable: z.boolean(),
  digLimit: count.nullable(),
  eventsOn: z.boolean(),
  event: eventId.nullable(),
  pastEvents: z.array(eventId).max(20),
  eventsLeft: count,
  dogsSheltering: count,
  dogsSlept: z.array(id),
  pickQueue: z.array(id),
  turnOrder: z.array(id),
  currentPlayer: id.nullable(),
  bag: cards,
  pendingDog: card.nullable(),
  powersOn: z.boolean(),
  powerWindow: powerWindow.nullable(),
  sniffing: id.nullable(),
  extraOrder: id.nullable(),
  digCount: count,
  hand: cards,
  peek: z.object({ cards }).nullable(),
  canUsePower: z.boolean(),
  yourBid: z.number().int().nullable(),
  yourDiscard: z.array(cardId).nullable(),
  yourPass: cardId.nullable(),
  result: gameResult.nullable(),
});

export const gameEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('ROUND_STARTED'),
    round: count,
    tieOrder: z.array(id),
    market: cards,
    faceDown: count,
  }),
  z.object({ type: z.literal('BID_PLACED'), playerId: id }),
  z.object({ type: z.literal('BIDS_REVEALED'), bids: z.record(z.string(), z.number().int()) }),
  z.object({ type: z.literal('BID_CLASH'), value: z.number().int(), playerIds: z.array(id) }),
  z.object({ type: z.literal('CARD_PICKED'), playerId: id, card }),
  z.object({ type: z.literal('MARKET_CLEARED'), cards }),
  z.object({ type: z.literal('PHASE_STARTED'), phase, turnOrder: z.array(id) }),
  z.object({ type: z.literal('TURN_STARTED'), playerId: id }),
  z.object({ type: z.literal('TURN_SKIPPED'), playerId: id }),
  z.object({ type: z.literal('TRASH_RESHUFFLED'), count }),
  z.object({
    type: z.literal('CARD_DUG'),
    playerId: id,
    card,
    to: z.enum(['bag', 'hand', 'dog']),
  }),
  z.object({ type: z.literal('DOG_APPEARED'), playerId: id, canThrowBone: z.boolean() }),
  z.object({ type: z.literal('BONE_THROWN'), playerId: id, bone: card }),
  z.object({ type: z.literal('DOG_CAUGHT'), playerId: id, lost: cards }),
  z.object({ type: z.literal('DOG_RETURNED') }),
  z.object({ type: z.literal('BAG_KEPT'), playerId: id, cards }),
  z.object({ type: z.literal('MEAL_EATEN'), playerId: id, meal, newPrice: z.number().int() }),
  z.object({ type: z.literal('DISCARD_CHOSEN'), playerId: id }),
  z.object({ type: z.literal('CARDS_DISCARDED'), playerId: id, cards }),
  z.object({ type: z.literal('GAME_OVER'), result: gameResult }),
  z.object({ type: z.literal('POWER_USED'), playerId: id, power: powerId }),
  z.object({ type: z.literal('POWER_WINDOW'), playerId: id, power: powerId }),
  z.object({
    type: z.literal('BID_CHANGED'),
    playerId: id,
    from: z.number().int(),
    to: z.number().int(),
  }),
  z.object({ type: z.literal('CARD_SCAVENGED'), playerId: id, card }),
  z.object({ type: z.literal('MARKET_SWAPPED'), playerId: id, out: card, in: card }),
  z.object({
    type: z.literal('PRICE_CHANGED'),
    food: foodType,
    from: z.number().int(),
    to: z.number().int(),
  }),
  z.object({ type: z.literal('EVENT_REVEALED'), round: count, event: eventId }),
  z.object({ type: z.literal('DOGS_SET_ASIDE'), count }),
  z.object({ type: z.literal('DOGS_BACK'), count }),
  z.object({ type: z.literal('VENDOR_GIFT'), playerId: id, card }),
  z.object({ type: z.literal('DOG_SLEPT'), playerId: id }),
  z.object({ type: z.literal('POWERS_RESTORED'), playerIds: z.array(id) }),
  z.object({ type: z.literal('PASS_CHOSEN'), playerId: id }),
  z.object({
    type: z.literal('CARDS_PASSED'),
    passes: z.array(z.object({ from: id, to: id, card })).max(4),
  }),
]);

const powerUse = z.discriminatedUnion('power', [
  z.object({ power: z.literal('keenNose') }),
  z.object({ power: z.literal('secondThought'), value: z.number().int() }),
  z.object({ power: z.literal('scavenger'), cardId }),
  z.object({ power: z.literal('luckySwap'), cardId }),
  z.object({ power: z.literal('goodLuck') }),
  z.object({ power: z.literal('extraOrder') }),
  z.object({ power: z.literal('haggle'), food: foodType }),
  z.object({ power: z.literal('bigAppetite'), cardIds: z.array(cardId).length(2) }),
]);

const cardIds = z.array(cardId).max(20);
export const actionSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('bid'), playerId: id, value: z.number().int() }),
  z.object({ type: z.literal('pick'), playerId: id, cardId }),
  z.object({ type: z.literal('dig'), playerId: id }),
  z.object({ type: z.literal('resolveDog'), playerId: id, useBone: z.boolean() }),
  z.object({ type: z.literal('stop'), playerId: id }),
  z.object({ type: z.literal('eat'), playerId: id, cardIds }),
  z.object({ type: z.literal('finishEating'), playerId: id }),
  z.object({ type: z.literal('discard'), playerId: id, cardIds }),
  z.object({ type: z.literal('usePower'), playerId: id, use: powerUse }),
  z.object({ type: z.literal('passPower'), playerId: id }),
  z.object({ type: z.literal('passCard'), playerId: id, cardId }),
]);

export const catSchema = z.enum(CAT_COLORS);
export const nameSchema = z.string().trim().max(NAME_MAX_LENGTH);
export const roomCodeSchema = z.string().regex(ROOM_CODE_PATTERN);
const botSchema = z.object({
  personality: z.enum(BOT_PERSONALITIES),
  difficulty: z.enum(BOT_DIFFICULTIES),
});
const turnSeconds = z.union(TURN_SECONDS_OPTIONS.map((s) => z.literal(s)));
/** Reconnect token handed out in `welcome`. */
export const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{16,64}$/);

// ---- client → server ----

export const clientMessageSchema = z.discriminatedUnion('type', [
  /** Take a seat (or reclaim yours with the token); watch if the game has started or is full. */
  z.object({
    type: z.literal('hello'),
    name: nameSchema,
    cat: catSchema,
    token: tokenSchema.optional(),
  }),
  z.object({ type: z.literal('action'), action: actionSchema }),
  z.object({ type: z.literal('emote'), id: z.enum(EMOTES) }),
  z.object({ type: z.literal('ping') }),
  /** Lobby or after a game: change your own name / cat. */
  z.object({ type: z.literal('updateMe'), name: nameSchema, cat: catSchema }),
  /** Lobby or after a game, host only. `start` after a game needs 2+ ready seats. */
  z.object({ type: z.literal('addBot'), bot: botSchema }),
  z.object({ type: z.literal('removeSeat'), seatId: id }),
  z.object({ type: z.literal('setTurnSeconds'), seconds: turnSeconds }),
  z.object({ type: z.literal('setMode'), powers: z.boolean(), events: z.boolean() }),
  z.object({ type: z.literal('setSpeed'), speed: z.enum(GAME_SPEEDS) }),
  z.object({ type: z.literal('start') }),
  /** After a game: want (or no longer want) to play again — GAME_RULES §13. */
  z.object({ type: z.literal('ready'), ready: z.boolean() }),
  /** Give up your seat (lobby) — during a game a bot takes over. */
  z.object({ type: z.literal('leave') }),
]);
type ParsedClientMessage = z.infer<typeof clientMessageSchema>;
/** The action message carries the engine's own (readonly) Action type. */
export type ClientMessage =
  | Exclude<ParsedClientMessage, { type: 'action' }>
  | { readonly type: 'action'; readonly action: Action };

// ---- server → client ----

const roomSeat = z.object({
  id,
  name: z.string().max(NAME_MAX_LENGTH).nullable(),
  cat: catSchema,
  bot: botSchema.nullable(),
  host: z.boolean(),
  connected: z.boolean(),
  standIn: z.boolean(),
  ready: z.boolean(),
  wins: count,
  sittingOut: z.enum(['watching', 'waiting']).nullable(),
});

export const roomInfoSchema = z.object({
  code: roomCodeSchema,
  status: z.enum(['lobby', 'playing', 'ended']),
  seats: z.array(roomSeat).max(4),
  turnSeconds,
  spectators: count,
  you: id.nullable(),
  gameNo: count,
  mode: z.object({ powers: z.boolean(), events: z.boolean() }),
  speed: z.enum(GAME_SPEEDS).optional(),
});

const turnClock = z.object({ playerId: id, remainingMs: count.nullable() });

/** Error keys the server can send: the engine's, plus room errors (all i18n keys). */
export const ROOM_ERROR_KEYS = [
  'room.error.notFound',
  'room.error.full',
  'room.error.notHost',
  'room.error.notEnoughPlayers',
  'room.error.notEnoughReady',
  'room.error.catTaken',
  'room.error.alreadyStarted',
  'room.error.notSeated',
  'room.error.badMessage',
  'room.error.tooFast',
  /** An action before the latest announcement has had its reading time (DECISIONS 051). */
  'room.error.notYet',
] as const;
export type RoomErrorKey = (typeof ROOM_ERROR_KEYS)[number];

export const serverMessageSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('welcome'), token: tokenSchema, seatId: id.nullable() }),
  z.object({ type: z.literal('room'), room: roomInfoSchema }),
  /** The game as this client may see it, the events since the last `view`, and who is on the clock. */
  z.object({
    type: z.literal('view'),
    view: playerViewSchema,
    events: z.array(gameEventSchema),
    clocks: z.array(turnClock),
    /** Actions open again in this many ms (everyone is still reading an announcement). */
    openInMs: count.optional(),
  }),
  z.object({ type: z.literal('emote'), from: id, id: z.enum(EMOTES) }),
  z.object({ type: z.literal('error'), key: z.enum([...ERROR_KEYS, ...ROOM_ERROR_KEYS]) }),
  z.object({ type: z.literal('pong') }),
]);
/** Written with the engine's (readonly) types, so the server can send engine values as they are. */
export type ServerMessage =
  | { readonly type: 'welcome'; readonly token: string; readonly seatId: string | null }
  | { readonly type: 'room'; readonly room: RoomInfo }
  | {
      readonly type: 'view';
      readonly view: PlayerView;
      readonly events: readonly GameEvent[];
      readonly clocks: readonly TurnClock[];
      readonly openInMs?: number | undefined;
    }
  | { readonly type: 'emote'; readonly from: string; readonly id: EmoteId }
  | { readonly type: 'error'; readonly key: ErrorKey | RoomErrorKey }
  | { readonly type: 'pong' };

/** Parses a raw WebSocket message; null if it is not valid JSON or does not match. */
export function parseMessage<T>(schema: z.ZodType<T>, raw: unknown): T | null {
  if (typeof raw !== 'string') return null;
  try {
    const result = schema.safeParse(JSON.parse(raw));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

// ---- compile-time drift checks against the engine ----

type Extends<A, B> = [A] extends [B] ? true : false;
type Assert<T extends true> = T;
export type ProtocolDriftChecks = [
  Assert<Extends<z.infer<typeof playerViewSchema>, PlayerView>>,
  Assert<Extends<z.infer<typeof gameEventSchema>, GameEvent>>,
  Assert<Extends<z.infer<typeof actionSchema>, Action>>,
  Assert<Extends<z.infer<typeof roomInfoSchema>, RoomInfo>>,
  Assert<Extends<z.infer<typeof turnClock>, TurnClock>>,
  Assert<Extends<z.infer<typeof serverMessageSchema>, ServerMessage>>,
  Assert<Extends<ParsedClientMessage, ClientMessage>>,
];
