// Internal phase transitions shared by createGame and applyAction.
// They mutate a private draft copy; callers never see a half-updated state.

import { FOOD_TYPES } from './config.ts';
import { currentEvent, nextSeat } from './events.ts';
import { hasEatingChoice, secondThoughtValues, topFoodInBin, unusedPower } from './powers.ts';
import type { Rng } from './rng.ts';
import { canDigTrash, computeTurnOrder, marketSize } from './rules.ts';
import { scoreGame } from './scoring.ts';
import type { Card, GameEvent, GameState, PlayerId } from './types.ts';
import type { PowerWindow } from './powers.ts';

export type Draft<T> = T extends readonly (infer U)[]
  ? Draft<U>[]
  : T extends object
    ? { -readonly [K in keyof T]: Draft<T[K]> }
    : T;

export interface Ctx {
  readonly s: Draft<GameState>;
  readonly rng: Rng;
  readonly events: GameEvent[];
}

export function cloneState(state: GameState): Draft<GameState> {
  // State is plain JSON data by design (it is saved and sent over the network).
  return JSON.parse(JSON.stringify(state)) as Draft<GameState>;
}

export function playerById(s: Draft<GameState>, id: PlayerId) {
  const player = s.players.find((p) => p.id === id);
  if (!player) throw new Error(`unknown player ${id}`);
  return player;
}

export function takeFromHand(hand: Card[], ids: readonly number[]): Card[] {
  const taken: Card[] = [];
  for (const id of ids) {
    const index = hand.findIndex((c) => c.id === id);
    if (index === -1) throw new Error(`card ${id} not in hand`);
    taken.push(...hand.splice(index, 1));
  }
  return taken;
}

/**
 * GAME_RULES §4.1: draw this round's public tie-break order, then lay out the stall.
 * Round 1 is a random draw; from round 2 the lowest score comes first (the draw breaks equal scores).
 */
export function startRound(ctx: Ctx, round: number): void {
  const { s } = ctx;
  s.round = round;
  s.phase = 'bidding';
  s.tieOrder = ctx.rng.shuffle(s.players.map((p) => p.id));
  if (round > 1) {
    const points = (id: PlayerId) =>
      playerById(s, id).meals.reduce((sum, meal) => sum + meal.points, 0);
    s.tieOrder = [...s.tieOrder].sort((a, b) => points(a) - points(b));
  }
  s.bids = Object.fromEntries(s.players.map((p) => [p.id, null]));
  s.revealedBids = null;
  s.clashed = [];
  s.pickQueue = [];
  s.turnOrder = [];
  s.turnIndex = 0;
  s.bag = [];
  s.pendingDog = null;
  s.pendingDiscards = {};
  s.powerWindow = null;
  s.peek = null;
  s.digCount = 0;
  s.extraOrder = null;
  s.faceDown = [];
  s.dogsSlept = [];
  s.passes = {};
  // §15: this round's event comes first, then the stall.
  revealEvent(ctx);
  s.market = s.marketDeck.splice(0, marketSize(s));
  stallEvents(ctx);
  const faceDown = new Set(s.faceDown);
  ctx.events.push({
    type: 'ROUND_STARTED',
    round,
    tieOrder: [...s.tieOrder],
    market: s.market.filter((c) => !faceDown.has(c.id)).map((c) => ({ ...c })),
    faceDown: faceDown.size,
  });
  // §14 Lucky Swap: the calico cat may change a stall card before anyone bids.
  const swapper = ownerOf(s, 'luckySwap');
  if (swapper && topFoodInBin(s.trashDeck)) openWindow(ctx, swapper, 'luckySwap');
}

/** §15: turn over this round's event and apply what happens before the stall. */
function revealEvent(ctx: Ctx): void {
  const { s } = ctx;
  if (!s.events) return;
  if (s.events.current) s.events.past.push(s.events.current);
  const event = s.events.deck.shift() ?? null;
  s.events.current = event;
  if (!event) return;
  ctx.events.push({ type: 'EVENT_REVEALED', round: s.round, event });
  switch (event) {
    case 'downpour': {
      const dogs = s.trashDeck
        .filter((c) => c.kind === 'dog')
        .slice(0, s.config.events.downpourDogs);
      s.trashDeck = s.trashDeck.filter((c) => !dogs.includes(c));
      s.setAsideDogs = dogs;
      ctx.events.push({ type: 'DOGS_SET_ASIDE', count: dogs.length });
      return;
    }
    case 'bargainRush': {
      const lowest = Math.min(...Object.values(s.prices));
      for (const food of FOOD_TYPES) {
        const from = s.prices[food];
        if (from !== lowest || from >= s.config.startPrice) continue;
        s.prices[food] = from + 1;
        ctx.events.push({ type: 'PRICE_CHANGED', food, from, to: from + 1 });
      }
      return;
    }
    case 'kindVendor':
      for (const playerId of s.tieOrder) {
        const card = drawGift(ctx);
        if (!card) break;
        playerById(s, playerId).hand.push(card);
        ctx.events.push({ type: 'VENDOR_GIFT', playerId, card: { ...card } });
      }
      return;
    case 'fullMoon': {
      const restored = s.players.filter((p) => s.powers?.[p.id]?.used).map((p) => p.id);
      for (const id of restored) s.powers![id]!.used = false;
      if (restored.length > 0) ctx.events.push({ type: 'POWERS_RESTORED', playerIds: restored });
      return;
    }
    default:
      return;
  }
}

/** Kind Vendor: the top card of the bin — a dog is shuffled back and the next one drawn. */
function drawGift(ctx: Ctx): Card | null {
  const { s } = ctx;
  for (let guard = 0; guard < 100; guard++) {
    if (!canDigTrash(s)) return null;
    if (!s.trashDeck.some((c) => c.kind !== 'dog')) reshuffleDiscardIntoTrash(ctx);
    const card = s.trashDeck.shift();
    if (!card) return null;
    if (card.kind !== 'dog') return card;
    returnDog(ctx, card);
  }
  return null;
}

/** §15 events that change the stall: an extra card, or cards laid face down. */
function stallEvents(ctx: Ctx): void {
  const { s } = ctx;
  const event = currentEvent(s);
  if (event === 'milkDelivery' || event === 'busyNight') {
    const milk = event === 'milkDelivery' ? s.trashDeck.find((c) => c.kind === 'milk') : undefined;
    const extra = milk ?? topFoodInBin(s.trashDeck);
    if (extra) {
      s.trashDeck.splice(s.trashDeck.indexOf(extra), 1);
      s.market.push(extra);
    }
  }
  if (event === 'blackout') {
    s.faceDown = ctx.rng
      .shuffle(s.market.map((c) => c.id))
      .slice(0, Math.min(s.config.events.blackoutCards, s.market.length));
  }
}

/** The player whose unused power this is (cats are unique, so at most one). */
function ownerOf(s: Draft<GameState>, power: PowerWindow['power']): PlayerId | null {
  return s.players.find((p) => unusedPower(s, p.id) === power)?.id ?? null;
}

function openWindow(ctx: Ctx, playerId: PlayerId, power: PowerWindow['power']): void {
  ctx.s.powerWindow = { playerId, power };
  ctx.events.push({ type: 'POWER_WINDOW', playerId, power });
}

/** All bids are in: reveal, resolve clashes, set pick queue and turn order (GAME_RULES §4–5). */
export function revealBids(ctx: Ctx): void {
  const { s } = ctx;
  const bids: Record<PlayerId, number> = {};
  for (const p of s.players) {
    const value = s.bids[p.id];
    if (value === null || value === undefined) throw new Error('revealBids before all bids are in');
    bids[p.id] = value;
    p.meowLeft = p.meowLeft.filter((v) => v !== value);
  }
  s.revealedBids = bids;
  s.bids = Object.fromEntries(s.players.map((p) => [p.id, null]));
  ctx.events.push({ type: 'BIDS_REVEALED', bids: { ...bids } });
  // §14 Second Thought: the black cat may shift its number before clashes are worked out.
  const rethinker = ownerOf(s, 'secondThought');
  if (rethinker && secondThoughtValues(s, rethinker).length > 0) {
    openWindow(ctx, rethinker, 'secondThought');
    return;
  }
  resolveClashes(ctx);
}

/** Bids are final: find clashes, set the pick queue and the turn order (§4–5). */
export function resolveClashes(ctx: Ctx): void {
  const { s } = ctx;
  const bids = s.revealedBids!;
  const byValue = new Map<number, PlayerId[]>();
  for (const p of s.players) {
    const value = bids[p.id]!;
    byValue.set(value, [...(byValue.get(value) ?? []), p.id]);
  }
  const clashValues = [...byValue.entries()].filter(([, ids]) => ids.length > 1);
  clashValues.sort(([a], [b]) => b - a);
  for (const [value, playerIds] of clashValues) {
    ctx.events.push({ type: 'BID_CLASH', value, playerIds });
  }
  s.clashed = clashValues.flatMap(([, ids]) => ids);
  // §4.5: unique bidders first (highest bid first), then clashed players in turn order.
  // §15 Queue Flip: this round the LOWEST unique bid picks first.
  const flip = currentEvent(s) === 'queueFlip' ? -1 : 1;
  const pickOrder = computeTurnOrder(s.players, bids, s.tieOrder);
  s.pickQueue = [
    ...s.players
      .filter((p) => !s.clashed.includes(p.id))
      .sort((a, b) => flip * (bids[b.id]! - bids[a.id]!))
      .map((p) => p.id),
    ...pickOrder.filter((id) => s.clashed.includes(id)),
  ];
  s.turnOrder = phaseOrder(s, 'trash');
  s.phase = 'pick';
  ctx.events.push({ type: 'PHASE_STARTED', phase: 'pick', turnOrder: [...s.pickQueue] });
  ctx.events.push({ type: 'TURN_STARTED', playerId: s.pickQueue[0]! });
}

/**
 * Turn order for Trash Dig / Feast Time: lowest bid first. Equal bids eat in the tie-break
 * order but DIG in reverse (GAME_RULES §5) — whoever picked first among them digs last.
 */
function phaseOrder(s: Draft<GameState>, phase: 'trash' | 'eat'): PlayerId[] {
  const tie = phase === 'trash' ? [...s.tieOrder].reverse() : s.tieOrder;
  return computeTurnOrder(s.players, s.revealedBids ?? {}, tie);
}

/** Everyone has picked: clear the stall and start digging (§4.6). */
export function endPicking(ctx: Ctx): void {
  const { s } = ctx;
  // §14 Extra Order: the siamese cat also gets what is left on the stall.
  if (s.extraOrder && s.market.length > 0) {
    const card = s.market.shift()!;
    playerById(s, s.extraOrder).hand.push(card);
    ctx.events.push({ type: 'CARD_PICKED', playerId: s.extraOrder, card: { ...card } });
  }
  clearMarket(ctx);
  startTrash(ctx);
}

/** §4.6: leftover stall cards go to the discard pile. */
function clearMarket(ctx: Ctx): void {
  const { s } = ctx;
  s.faceDown = [];
  if (s.market.length === 0) return;
  const cards = s.market.splice(0);
  s.discard.push(...cards);
  ctx.events.push({ type: 'MARKET_CLEARED', cards: cards.map((c) => ({ ...c })) });
}

/**
 * Top card of the bin, or null if it holds only dogs and the discard pile is empty.
 * GAME_RULES §5: when only dogs are left, the discard pile is shuffled in first.
 */
export function drawFromTrash(ctx: Ctx): Card | null {
  const { s } = ctx;
  if (!canDigTrash(s)) return null;
  if (!s.trashDeck.some((c) => c.kind !== 'dog')) reshuffleDiscardIntoTrash(ctx);
  const card = s.trashDeck.shift() ?? null;
  s.digCount++;
  // Keen Nose: the sniffer's knowledge of the top of the bin moves down one card.
  if (s.peek) {
    if (card && s.peek.cards[0]?.id === card.id) s.peek.cards.shift();
    else s.peek = null;
  }
  return card;
}

function reshuffleDiscardIntoTrash(ctx: Ctx): void {
  const { s } = ctx;
  const count = s.discard.length;
  s.trashDeck = ctx.rng.shuffle([...s.trashDeck, ...s.discard.splice(0)]);
  s.peek = null;
  ctx.events.push({ type: 'TRASH_RESHUFFLED', count });
}

/** Dogs never leave: shuffle it back into the bin. */
export function returnDog(ctx: Ctx, dog: Card): void {
  ctx.s.trashDeck = ctx.rng.shuffle([...ctx.s.trashDeck, dog]);
  ctx.s.peek = null;
  ctx.events.push({ type: 'DOG_RETURNED' });
}

/** §5: the whole discard pile goes back into the bin at the start of every Trash Dig. */
function startTrash(ctx: Ctx): void {
  const { s } = ctx;
  s.phase = 'trash';
  s.turnIndex = 0;
  s.bag = [];
  s.pendingDog = null;
  s.digCount = 0;
  s.peek = null;
  if (s.discard.length > 0) reshuffleDiscardIntoTrash(ctx);
  ctx.events.push({ type: 'PHASE_STARTED', phase: 'trash', turnOrder: [...s.turnOrder] });
  ctx.events.push({ type: 'TURN_STARTED', playerId: s.turnOrder[0]! });
}

export function endTrashTurn(ctx: Ctx): void {
  const { s } = ctx;
  s.bag = [];
  s.pendingDog = null;
  s.digCount = 0;
  s.peek = null;
  s.turnIndex++;
  if (s.turnIndex < s.turnOrder.length) {
    ctx.events.push({ type: 'TURN_STARTED', playerId: s.turnOrder[s.turnIndex]! });
    return;
  }
  // §15 Gusty Wind: everyone holding cards passes one on before Feast Time.
  const passers = currentEvent(s) === 'gustyWind' ? s.players.filter((p) => p.hand.length > 0) : [];
  if (passers.length > 0) {
    s.phase = 'pass';
    s.turnOrder = [];
    s.passes = Object.fromEntries(passers.map((p) => [p.id, null]));
    ctx.events.push({ type: 'PHASE_STARTED', phase: 'pass', turnOrder: passers.map((p) => p.id) });
    return;
  }
  startFeast(ctx);
}

export function startFeast(ctx: Ctx): void {
  const { s } = ctx;
  s.phase = 'eat';
  s.turnIndex = 0;
  s.turnOrder = phaseOrder(s, 'eat');
  ctx.events.push({ type: 'PHASE_STARTED', phase: 'eat', turnOrder: [...s.turnOrder] });
  beginEatTurn(ctx);
}

/** Gusty Wind: everyone has chosen — all passes happen at once. */
export function revealPasses(ctx: Ctx): void {
  const { s } = ctx;
  const moves = Object.entries(s.passes).map(([from, cardId]) => {
    const card = takeFromHand(playerById(s, from).hand, [cardId!])[0]!;
    return { from, to: nextSeat(s.players, from), card };
  });
  for (const m of moves) playerById(s, m.to).hand.push(m.card);
  s.passes = {};
  ctx.events.push({
    type: 'CARDS_PASSED',
    passes: moves.map((m) => ({ ...m, card: { ...m.card } })),
  });
  startFeast(ctx);
}

/** §6 (+§14): is there anything this player could do on their eat turn? */
export function canEatAnything(s: Draft<GameState>, playerId: PlayerId): boolean {
  return hasEatingChoice(s, playerId);
}

/** §6: start the current eater's turn, skipping everyone who has nothing to eat. */
function beginEatTurn(ctx: Ctx): void {
  const { s } = ctx;
  while (s.turnIndex < s.turnOrder.length) {
    const playerId = s.turnOrder[s.turnIndex]!;
    if (canEatAnything(s, playerId)) {
      ctx.events.push({ type: 'TURN_STARTED', playerId });
      return;
    }
    ctx.events.push({ type: 'TURN_SKIPPED', playerId });
    s.turnIndex++;
  }
  endFeast(ctx);
}

export function endEatTurn(ctx: Ctx): void {
  ctx.s.turnIndex++;
  beginEatTurn(ctx);
}

function endFeast(ctx: Ctx): void {
  const { s } = ctx;
  // §15 Downpour: the dogs that sheltered from the rain come back.
  if (s.setAsideDogs.length > 0) {
    const count = s.setAsideDogs.length;
    s.trashDeck = ctx.rng.shuffle([...s.trashDeck, ...s.setAsideDogs.splice(0)]);
    ctx.events.push({ type: 'DOGS_BACK', count });
  }
  // GAME_RULES §6–7: no hand-limit discard after the final round — the game just ends.
  if (s.round >= s.config.rounds) {
    endGame(ctx);
    return;
  }

  const over = s.players.filter((p) => p.hand.length > s.config.handLimit);
  if (over.length === 0) {
    startRound(ctx, s.round + 1);
    return;
  }
  s.phase = 'discard';
  s.pendingDiscards = Object.fromEntries(over.map((p) => [p.id, null]));
  ctx.events.push({ type: 'PHASE_STARTED', phase: 'discard', turnOrder: over.map((p) => p.id) });
}

/** Everyone who had to discard has chosen: reveal all at once (GAME_RULES §6). */
export function revealDiscards(ctx: Ctx): void {
  const { s } = ctx;
  for (const p of s.players) {
    const ids = s.pendingDiscards[p.id];
    if (!ids) continue;
    const cards = takeFromHand(p.hand, ids);
    s.discard.push(...cards);
    ctx.events.push({
      type: 'CARDS_DISCARDED',
      playerId: p.id,
      cards: cards.map((c) => ({ ...c })),
    });
  }
  s.pendingDiscards = {};
  startRound(ctx, s.round + 1);
}

function endGame(ctx: Ctx): void {
  const { s } = ctx;
  s.phase = 'gameOver';
  s.turnOrder = [];
  s.turnIndex = 0;
  const result = scoreGame(s);
  s.result = JSON.parse(JSON.stringify(result)) as Draft<typeof result>;
  ctx.events.push({ type: 'GAME_OVER', result });
}

export function initialPrices(startPrice: number): Record<(typeof FOOD_TYPES)[number], number> {
  return Object.fromEntries(FOOD_TYPES.map((f) => [f, startPrice])) as Record<
    (typeof FOOD_TYPES)[number],
    number
  >;
}
