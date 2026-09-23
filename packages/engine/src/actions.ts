import { checkMeal } from './cards.ts';
import {
  clearMarket,
  cloneState,
  type Ctx,
  drawFromTrash,
  endEatTurn,
  endTrashTurn,
  playerById,
  revealBids,
  returnDog,
  revealDiscards,
  startTrash,
  takeFromHand,
} from './flow.ts';
import { createRng } from './rng.ts';
import { currentPlayer } from './rules.ts';
import type { Action, ActionResult, Card, ErrorKey, GameState } from './types.ts';

/**
 * The only way to change a game. Pure: the input state is never mutated, and the
 * same state + action always gives the same result (all randomness comes from state.rng).
 */
export function applyAction(state: GameState, action: Action): ActionResult {
  if (state.phase === 'gameOver') return { ok: false, error: 'error.gameOver' };
  if (!state.players.some((p) => p.id === action.playerId)) {
    return { ok: false, error: 'error.unknownPlayer' };
  }

  const ctx: Ctx = { s: cloneState(state), rng: createRng(state.rng), events: [] };
  const error = handle(ctx, action);
  if (error) return { ok: false, error };

  ctx.s.rng = ctx.rng.state;
  return { ok: true, state: ctx.s, events: ctx.events };
}

function handle(ctx: Ctx, action: Action): ErrorKey | null {
  switch (action.type) {
    case 'bid':
      return bid(ctx, action.playerId, action.value);
    case 'pick':
      return pick(ctx, action.playerId, action.cardId);
    case 'dig':
      return dig(ctx, action.playerId);
    case 'resolveDog':
      return resolveDog(ctx, action.playerId, action.useBone);
    case 'stop':
      return stop(ctx, action.playerId);
    case 'eat':
      return eat(ctx, action.playerId, action.cardIds);
    case 'finishEating':
      return finishEating(ctx, action.playerId);
    case 'discard':
      return discard(ctx, action.playerId, action.cardIds);
  }
}

function requireTurn(ctx: Ctx, phase: GameState['phase'], playerId: string): ErrorKey | null {
  if (ctx.s.phase !== phase) return 'error.wrongPhase';
  if (currentPlayer(ctx.s) !== playerId) return 'error.notYourTurn';
  return null;
}

function hasDuplicates(ids: readonly number[]): boolean {
  return new Set(ids).size !== ids.length;
}

// ── §4 Stall Scramble ────────────────────────────────────────────────────────

function bid(ctx: Ctx, playerId: string, value: number): ErrorKey | null {
  const { s } = ctx;
  if (s.phase !== 'bidding') return 'error.wrongPhase';
  if (s.bids[playerId] !== null) return 'error.alreadyBid';
  if (!playerById(s, playerId).meowLeft.includes(value)) return 'error.meowUsed';

  s.bids[playerId] = value;
  ctx.events.push({ type: 'BID_PLACED', playerId });
  if (s.players.every((p) => s.bids[p.id] !== null)) revealBids(ctx);
  return null;
}

function pick(ctx: Ctx, playerId: string, cardId: number): ErrorKey | null {
  const { s } = ctx;
  const error = requireTurn(ctx, 'pick', playerId);
  if (error) return error;
  const index = s.market.findIndex((c) => c.id === cardId);
  if (index === -1) return 'error.cardNotInMarket';

  const [card] = s.market.splice(index, 1) as [Card];
  const player = playerById(s, playerId);
  player.hand.push(card);
  player.picks.push({ ...card });
  s.pickQueue.shift();
  ctx.events.push({ type: 'CARD_PICKED', playerId, card: { ...card } });

  if (s.pickQueue.length > 0) {
    ctx.events.push({ type: 'TURN_STARTED', playerId: s.pickQueue[0]! });
  } else {
    clearMarket(ctx);
    startTrash(ctx);
  }
  return null;
}

// ── §5 Trash Dig ─────────────────────────────────────────────────────────────

function dig(ctx: Ctx, playerId: string): ErrorKey | null {
  const { s } = ctx;
  const error = requireTurn(ctx, 'trash', playerId);
  if (error) return error;
  if (s.pendingDog) return 'error.dogPending';
  const card = drawFromTrash(ctx);
  if (!card) return 'error.trashEmpty';
  const player = playerById(s, playerId);

  if (card.kind === 'bone') {
    player.hand.push(card);
    ctx.events.push({ type: 'CARD_DUG', playerId, card: { ...card }, to: 'hand' });
  } else if (card.kind === 'dog') {
    ctx.events.push({ type: 'CARD_DUG', playerId, card: { ...card }, to: 'dog' });
    const canThrowBone = player.hand.some((c) => c.kind === 'bone');
    ctx.events.push({ type: 'DOG_APPEARED', playerId, canThrowBone });
    if (canThrowBone) s.pendingDog = card;
    else caught(ctx, playerId, card);
  } else {
    s.bag.push(card);
    ctx.events.push({ type: 'CARD_DUG', playerId, card: { ...card }, to: 'bag' });
  }
  return null;
}

function resolveDog(ctx: Ctx, playerId: string, useBone: boolean): ErrorKey | null {
  const { s } = ctx;
  const error = requireTurn(ctx, 'trash', playerId);
  if (error) return error;
  const dog = s.pendingDog;
  if (!dog) return 'error.noDogPending';

  if (!useBone) {
    caught(ctx, playerId, dog);
    return null;
  }

  const player = playerById(s, playerId);
  const bone = player.hand.find((c) => c.kind === 'bone');
  if (!bone) return 'error.noBone';
  takeFromHand(player.hand, [bone.id]);
  s.discard.push(bone);
  s.pendingDog = null;
  ctx.events.push({ type: 'BONE_THROWN', playerId, bone: { ...bone } });
  returnDog(ctx, dog);
  return null;
}

/** Chased off: the whole bag goes to the discard pile and the turn ends. */
function caught(ctx: Ctx, playerId: string, dog: Card): void {
  const { s } = ctx;
  const lost = s.bag.splice(0);
  s.discard.push(...lost);
  s.pendingDog = null;
  ctx.events.push({ type: 'DOG_CAUGHT', playerId, lost: lost.map((c) => ({ ...c })) });
  returnDog(ctx, dog);
  endTrashTurn(ctx);
}

function stop(ctx: Ctx, playerId: string): ErrorKey | null {
  const { s } = ctx;
  const error = requireTurn(ctx, 'trash', playerId);
  if (error) return error;
  if (s.pendingDog) return 'error.dogPending';

  const cards = s.bag.splice(0);
  playerById(s, playerId).hand.push(...cards);
  ctx.events.push({ type: 'BAG_KEPT', playerId, cards: cards.map((c) => ({ ...c })) });
  endTrashTurn(ctx);
  return null;
}

// ── §6 Feast Time ────────────────────────────────────────────────────────────

function eat(ctx: Ctx, playerId: string, cardIds: readonly number[]): ErrorKey | null {
  const { s } = ctx;
  const error = requireTurn(ctx, 'eat', playerId);
  if (error) return error;
  if (hasDuplicates(cardIds)) return 'error.duplicateCard';

  const player = playerById(s, playerId);
  const cards = cardIds.map((id) => player.hand.find((c) => c.id === id));
  if (cards.some((c) => c === undefined)) return 'error.cardNotInHand';
  const meal = checkMeal(cards as Card[], s.config);
  if (!meal) return 'error.invalidMeal';

  const price = s.prices[meal.food];
  const points = meal.big ? price * s.config.bigMealMultiplier : price;
  const newPrice = Math.max(s.config.minPrice, price - s.config.priceDropPerMeal);
  const eaten = takeFromHand(player.hand, cardIds);
  const record = { round: s.round, food: meal.food, cards: eaten, big: meal.big, price, points };
  player.meals.push(record);
  s.prices[meal.food] = newPrice;
  ctx.events.push({
    type: 'MEAL_EATEN',
    playerId,
    meal: JSON.parse(JSON.stringify(record)) as typeof record,
    newPrice,
  });
  return null;
}

function finishEating(ctx: Ctx, playerId: string): ErrorKey | null {
  const error = requireTurn(ctx, 'eat', playerId);
  if (error) return error;
  endEatTurn(ctx);
  return null;
}

// ── §6 end of round: hand limit ──────────────────────────────────────────────

function discard(ctx: Ctx, playerId: string, cardIds: readonly number[]): ErrorKey | null {
  const { s } = ctx;
  if (s.phase !== 'discard') return 'error.wrongPhase';
  if (!(playerId in s.pendingDiscards)) return 'error.noDiscardNeeded';
  if (s.pendingDiscards[playerId] !== null) return 'error.alreadyDiscarded';

  const player = playerById(s, playerId);
  if (cardIds.length !== player.hand.length - s.config.handLimit) return 'error.wrongDiscardCount';
  if (hasDuplicates(cardIds)) return 'error.duplicateCard';
  if (!cardIds.every((id) => player.hand.some((c) => c.id === id))) return 'error.cardNotInHand';

  s.pendingDiscards[playerId] = [...cardIds];
  ctx.events.push({ type: 'DISCARD_CHOSEN', playerId });
  if (Object.values(s.pendingDiscards).every((ids) => ids !== null)) revealDiscards(ctx);
  return null;
}
