// Internal phase transitions shared by createGame and applyAction.
// They mutate a private draft copy; callers never see a half-updated state.

import { findMealOptions } from './cards.ts';
import { FOOD_TYPES } from './config.ts';
import type { Rng } from './rng.ts';
import { canDigTrash, computeTurnOrder, marketSize } from './rules.ts';
import { scoreGame } from './scoring.ts';
import type { Card, GameEvent, GameState, PlayerId } from './types.ts';

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
  s.market = s.marketDeck.splice(0, marketSize(s));
  s.bids = Object.fromEntries(s.players.map((p) => [p.id, null]));
  s.revealedBids = null;
  s.clashed = [];
  s.pickQueue = [];
  s.turnOrder = [];
  s.turnIndex = 0;
  s.bag = [];
  s.pendingDog = null;
  s.pendingDiscards = {};
  ctx.events.push({
    type: 'ROUND_STARTED',
    round,
    tieOrder: [...s.tieOrder],
    market: s.market.map((c) => ({ ...c })),
  });
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
  const pickOrder = computeTurnOrder(s.players, bids, s.tieOrder);
  s.pickQueue = [
    ...s.players
      .filter((p) => !s.clashed.includes(p.id))
      .sort((a, b) => bids[b.id]! - bids[a.id]!)
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
  clearMarket(ctx);
  startTrash(ctx);
}

/** §4.6: leftover stall cards go to the discard pile. */
function clearMarket(ctx: Ctx): void {
  const { s } = ctx;
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
  return s.trashDeck.shift() ?? null;
}

function reshuffleDiscardIntoTrash(ctx: Ctx): void {
  const { s } = ctx;
  const count = s.discard.length;
  s.trashDeck = ctx.rng.shuffle([...s.trashDeck, ...s.discard.splice(0)]);
  ctx.events.push({ type: 'TRASH_RESHUFFLED', count });
}

/** Dogs never leave: shuffle it back into the bin. */
export function returnDog(ctx: Ctx, dog: Card): void {
  ctx.s.trashDeck = ctx.rng.shuffle([...ctx.s.trashDeck, dog]);
  ctx.events.push({ type: 'DOG_RETURNED' });
}

/** §5: the whole discard pile goes back into the bin at the start of every Trash Dig. */
function startTrash(ctx: Ctx): void {
  const { s } = ctx;
  s.phase = 'trash';
  s.turnIndex = 0;
  s.bag = [];
  s.pendingDog = null;
  if (s.discard.length > 0) reshuffleDiscardIntoTrash(ctx);
  ctx.events.push({ type: 'PHASE_STARTED', phase: 'trash', turnOrder: [...s.turnOrder] });
  ctx.events.push({ type: 'TURN_STARTED', playerId: s.turnOrder[0]! });
}

export function endTrashTurn(ctx: Ctx): void {
  const { s } = ctx;
  s.bag = [];
  s.pendingDog = null;
  s.turnIndex++;
  if (s.turnIndex < s.turnOrder.length) {
    ctx.events.push({ type: 'TURN_STARTED', playerId: s.turnOrder[s.turnIndex]! });
    return;
  }
  s.phase = 'eat';
  s.turnIndex = 0;
  s.turnOrder = phaseOrder(s, 'eat');
  ctx.events.push({ type: 'PHASE_STARTED', phase: 'eat', turnOrder: [...s.turnOrder] });
  beginEatTurn(ctx);
}

export function canEatAnything(s: Draft<GameState>, playerId: PlayerId): boolean {
  return findMealOptions(playerById(s, playerId).hand, s.config).length > 0;
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
