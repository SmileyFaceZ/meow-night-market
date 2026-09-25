import { checkMeal } from './cards.ts';
import {
  canEatAnything,
  cloneState,
  type Ctx,
  drawFromTrash,
  endEatTurn,
  endPicking,
  endTrashTurn,
  finishPicking,
  playerById,
  resolveClashes,
  revealBids,
  returnDog,
  revealDiscards,
  takeFromHand,
} from './flow.ts';
import {
  canUsePowerNow,
  isAppetitePair,
  type PowerUse,
  scavengeable,
  secondThoughtValues,
  topFoodInBin,
  unusedPower,
} from './powers.ts';
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
  const error = blockedByPower(ctx, action) ?? handle(ctx, action);
  if (error) return { ok: false, error };

  ctx.s.rng = ctx.rng.state;
  return { ok: true, state: ctx.s, events: ctx.events };
}

/** While a power window or an undecided sniff is open, nothing else can happen. */
function blockedByPower(ctx: Ctx, action: Action): ErrorKey | null {
  const { powerWindow, peek } = ctx.s;
  if (powerWindow) {
    const decides = action.type === 'usePower' || action.type === 'passPower';
    return decides && action.playerId === powerWindow.playerId ? null : 'error.powerPending';
  }
  if (peek && !peek.decided && action.type !== 'sniff') return 'error.powerPending';
  return null;
}

function handle(ctx: Ctx, action: Action): ErrorKey | null {
  switch (action.type) {
    case 'usePower':
      return usePower(ctx, action.playerId, action.use);
    case 'passPower':
      return passPower(ctx, action.playerId);
    case 'sniff':
      return sniff(ctx, action.playerId, action.bottomCardId);
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
  s.pickQueue.shift();
  ctx.events.push({ type: 'CARD_PICKED', playerId, card: { ...card } });

  if (s.pickQueue.length > 0) {
    ctx.events.push({ type: 'TURN_STARTED', playerId: s.pickQueue[0]! });
  } else {
    endPicking(ctx);
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
    // A choice to make: throw a bone, or (korat cat) use Good-Luck Cat.
    if (canThrowBone || unusedPower(s, playerId) === 'goodLuck') s.pendingDog = card;
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
  // §6: nothing left to eat → the turn ends by itself.
  if (!canEatAnything(s, playerId)) endEatTurn(ctx);
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

// ── §14 Cat powers ───────────────────────────────────────────────────────────

function usePower(ctx: Ctx, playerId: string, use: PowerUse): ErrorKey | null {
  const { s } = ctx;
  const power = unusedPower(s, playerId);
  if (!power) return 'error.noPower';
  if (power !== use.power || !canUsePowerNow(s, playerId)) return 'error.powerNotNow';
  return applyPower(ctx, playerId, use);
}

/** Checks the target, then spends the power and applies its effect. */
function applyPower(ctx: Ctx, playerId: string, use: PowerUse): ErrorKey | null {
  const { s } = ctx;
  const player = playerById(s, playerId);
  const spend = () => {
    s.powers![playerId]!.used = true;
    ctx.events.push({ type: 'POWER_USED', playerId, power: use.power });
  };

  switch (use.power) {
    case 'keenNose': {
      // Same rule as a dig: with only dogs left, the discard pile is shuffled in first.
      if (!s.trashDeck.some((c) => c.kind !== 'dog') && s.discard.length > 0) {
        s.trashDeck = ctx.rng.shuffle([...s.trashDeck, ...s.discard.splice(0)]);
        ctx.events.push({ type: 'TRASH_RESHUFFLED', count: s.trashDeck.length });
      }
      spend();
      s.peek = { playerId, cards: s.trashDeck.slice(0, 2).map((c) => ({ ...c })), decided: false };
      return null;
    }
    case 'secondThought': {
      if (!secondThoughtValues(s, playerId).includes(use.value)) return 'error.invalidPowerTarget';
      const from = s.revealedBids![playerId]!;
      spend();
      s.revealedBids![playerId] = use.value;
      player.meowLeft = [...player.meowLeft.filter((v) => v !== use.value), from].sort(
        (a, b) => a - b,
      );
      ctx.events.push({ type: 'BID_CHANGED', playerId, from, to: use.value });
      s.powerWindow = null;
      resolveClashes(ctx);
      return null;
    }
    case 'scavenger': {
      const fromStall = s.config.scavengerTiming === 'afterPick';
      const pile = fromStall ? s.market : s.discard;
      const index = pile.findIndex((c) => c.id === use.cardId);
      if (index === -1 || (!fromStall && !scavengeable(pile).some((c) => c.id === use.cardId))) {
        return 'error.invalidPowerTarget';
      }
      spend();
      const [card] = pile.splice(index, 1) as [Card];
      player.hand.push(card);
      ctx.events.push({ type: 'CARD_SCAVENGED', playerId, card: { ...card } });
      if (fromStall) {
        s.powerWindow = null;
        finishPicking(ctx);
      } else if (!canEatAnything(s, playerId)) {
        endEatTurn(ctx);
      }
      return null;
    }
    case 'luckySwap': {
      const index = s.market.findIndex((c) => c.id === use.cardId);
      const fresh = topFoodInBin(s.trashDeck);
      if (index === -1 || !fresh) return 'error.invalidPowerTarget';
      spend();
      s.trashDeck.splice(
        s.trashDeck.findIndex((c) => c.id === fresh.id),
        1,
      );
      const out = s.market[index]!;
      s.market[index] = fresh;
      s.discard.push(out);
      ctx.events.push({ type: 'MARKET_SWAPPED', playerId, out: { ...out }, in: { ...fresh } });
      s.powerWindow = null;
      return null;
    }
    case 'goodLuck': {
      const dog = s.pendingDog!;
      spend();
      s.pendingDog = null;
      const effect = s.config.goodLuckEffect;
      if (effect === 'halfBag' || effect === 'halfBagEndTurn') {
        const lost = s.bag.splice(0, Math.ceil(s.bag.length / 2));
        s.discard.push(...lost);
        ctx.events.push({ type: 'DOG_CAUGHT', playerId, lost: lost.map((c) => ({ ...c })) });
      }
      returnDog(ctx, dog);
      if (effect === 'endTurn' || effect === 'halfBagEndTurn') {
        const kept = s.bag.splice(0);
        player.hand.push(...kept);
        ctx.events.push({ type: 'BAG_KEPT', playerId, cards: kept.map((c) => ({ ...c })) });
        endTrashTurn(ctx);
      }
      return null;
    }
    case 'extraOrder':
      spend();
      s.extraOrder = playerId;
      return null;
    case 'haggle': {
      const from = s.prices[use.food];
      if (from >= s.config.startPrice) return 'error.invalidPowerTarget';
      spend();
      s.prices[use.food] = from + 1;
      ctx.events.push({ type: 'PRICE_CHANGED', food: use.food, from, to: from + 1 });
      return null;
    }
    case 'bigAppetite': {
      if (hasDuplicates(use.cardIds)) return 'error.duplicateCard';
      const cards = use.cardIds.map((id) => player.hand.find((c) => c.id === id));
      if (cards.some((c) => c === undefined)) return 'error.cardNotInHand';
      const food = isAppetitePair(cards as Card[]);
      if (!food) return 'error.invalidPowerTarget';
      spend();
      const price = s.prices[food];
      const points = Math.max(1, price - 1);
      const newPrice = Math.max(s.config.minPrice, price - s.config.priceDropPerMeal);
      const eaten = takeFromHand(player.hand, use.cardIds);
      const record = { round: s.round, food, cards: eaten, big: false, price, points };
      player.meals.push(record);
      s.prices[food] = newPrice;
      ctx.events.push({
        type: 'MEAL_EATEN',
        playerId,
        meal: JSON.parse(JSON.stringify(record)) as typeof record,
        newPrice,
      });
      if (!canEatAnything(s, playerId)) endEatTurn(ctx);
      return null;
    }
  }
}

/** Let an open window pass: the game carries on as if the power did not exist. */
function passPower(ctx: Ctx, playerId: string): ErrorKey | null {
  const { s } = ctx;
  const window = s.powerWindow;
  if (!window || window.playerId !== playerId) return 'error.powerNotNow';
  s.powerWindow = null;
  if (window.power === 'secondThought') resolveClashes(ctx);
  else if (window.power === 'scavenger') finishPicking(ctx);
  return null;
}

/** Keen Nose: send one of the two sniffed cards to the bottom of the bin, or neither. */
function sniff(ctx: Ctx, playerId: string, bottomCardId: number | null): ErrorKey | null {
  const { s } = ctx;
  const peek = s.peek;
  if (!peek || peek.decided || peek.playerId !== playerId) return 'error.powerNotNow';
  if (bottomCardId !== null) {
    if (!peek.cards.some((c) => c.id === bottomCardId)) return 'error.invalidPowerTarget';
    const index = s.trashDeck.findIndex((c) => c.id === bottomCardId);
    const [card] = s.trashDeck.splice(index, 1) as [Card];
    s.trashDeck.push(card);
    peek.cards = peek.cards.filter((c) => c.id !== bottomCardId);
  }
  peek.decided = true;
  ctx.events.push({ type: 'SNIFFED', playerId, movedToBottom: bottomCardId !== null });
  return null;
}
