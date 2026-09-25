// How bots use cat powers (GAME_RULES §14): one simple rule per power, the same for every
// personality. Thresholds live in POWER_TUNING (config.ts). Bots see only their view.

import { FOOD_TYPES, POWER_TUNING } from '../config.ts';
import { pairOptions, scavengeable } from '../powers.ts';
import type { Action, Card } from '../types.ts';
import type { PlayerView } from '../view.ts';
import {
  type BotCtx,
  type BotPolicy,
  cardValue,
  completesMeal,
  countKind,
  dogRisk,
  isLastRound,
} from './common.ts';

const T = POWER_TUNING;

/**
 * A power move to make now, or null to play normally. Open windows and an undecided
 * sniff always get an answer (the game waits for it).
 */
export function powerMove(policy: BotPolicy, ctx: BotCtx): Action | null {
  const { view, me } = ctx;
  const playerId = me.id;
  const window = view.powerWindow;
  if (window?.playerId === playerId) {
    const use = windowChoice(ctx);
    return use ? { type: 'usePower', playerId, use } : { type: 'passPower', playerId };
  }
  if (view.peek && !view.peek.decided) {
    return { type: 'sniff', playerId, bottomCardId: sniffChoice(view.peek.cards) };
  }
  if (!view.canUsePower) return null;

  switch (me.power) {
    case 'keenNose':
      return dogRisk(view) >= T.keenNose.minDogRisk
        ? { type: 'usePower', playerId, use: { power: 'keenNose' } }
        : null;
    case 'goodLuck': {
      const bag = view.bag.length;
      const worth =
        bag >= T.goodLuck.minBag || (view.round >= T.goodLuck.anyBagFromRound && bag > 0);
      return worth ? { type: 'usePower', playerId, use: { power: 'goodLuck' } } : null;
    }
    case 'extraOrder': {
      const values = view.market.map((c) => cardValue(view, view.hand, c)).sort((a, b) => b - a);
      const lastToPick = view.pickQueue.length === 1;
      const worth =
        (lastToPick && (values[1] ?? 0) >= T.extraOrder.minLeftoverValue) ||
        view.round >= T.extraOrder.anywayFromRound;
      return worth ? { type: 'usePower', playerId, use: { power: 'extraOrder' } } : null;
    }
    case 'scavenger': {
      const card = scavengeTarget(view, scavengeable(view.discard));
      return card
        ? { type: 'usePower', playerId, use: { power: 'scavenger', cardId: card.id } }
        : null;
    }
    case 'haggle': {
      // The meal I am about to eat: +1 point for me.
      const meal = policy.meal(ctx);
      if (meal && view.prices[meal.food] < view.config.startPrice) {
        return { type: 'usePower', playerId, use: { power: 'haggle', food: meal.food } };
      }
      if (view.round < T.haggle.anywayFromRound) return null;
      // Late in the game: the cheap food I hold most of (I will eat it later).
      const food = FOOD_TYPES.filter((f) => view.prices[f] < view.config.startPrice).sort(
        (a, b) => countKind(view.hand, b) - countKind(view.hand, a),
      )[0];
      return food ? { type: 'usePower', playerId, use: { power: 'haggle', food } } : null;
    }
    case 'bigAppetite': {
      // Full meals come first; a pair is for when nothing better is on.
      if (policy.meal(ctx)) return null;
      const pairs = pairOptions(view.hand)
        .map((p) => ({ ...p, points: Math.max(1, view.prices[p.food] - 1) }))
        .sort((a, b) => b.points - a.points);
      const best = pairs[0];
      const worth =
        best &&
        (best.points >= T.bigAppetite.minPoints || view.round >= T.bigAppetite.anywayFromRound);
      return worth
        ? { type: 'usePower', playerId, use: { power: 'bigAppetite', cardIds: best.cardIds } }
        : null;
    }
    default:
      return null;
  }
}

/** Inside a window: the use to make, or null to let it pass. */
function windowChoice(ctx: BotCtx): Extract<Action, { type: 'usePower' }>['use'] | null {
  const { view, me } = ctx;
  switch (view.powerWindow!.power) {
    case 'luckySwap': {
      const scored = view.market
        .map((card) => ({ card, value: cardValue(view, view.hand, card) }))
        .sort((a, b) => a.value - b.value);
      const best = scored.at(-1)?.value ?? 0;
      const swap = best < T.luckySwap.minBestValue || view.round >= T.luckySwap.anywayFromRound;
      return swap && scored[0] ? { power: 'luckySwap', cardId: scored[0].card.id } : null;
    }
    case 'secondThought': {
      const bid = me.revealedBid!;
      const others = view.players.filter((p) => p.id !== me.id).map((p) => p.revealedBid);
      const free = (v: number) => me.meowLeft.includes(v) && !others.includes(v);
      const clashing = others.includes(bid);
      // Higher numbers pick first, so prefer moving up.
      const target = [bid + 1, bid - 1].find(free);
      if (target === undefined) return null;
      if (clashing) return { power: 'secondThought', value: target };
      const climb = view.round >= T.secondThought.climbFromRound && free(bid + 1);
      return climb ? { power: 'secondThought', value: bid + 1 } : null;
    }
    case 'scavenger': {
      // Alternative timing: the stall's leftover card is free — take it.
      const card = [...view.market].sort(
        (a, b) => cardValue(view, view.hand, b) - cardValue(view, view.hand, a),
      )[0];
      return card ? { power: 'scavenger', cardId: card.id } : null;
    }
  }
}

/** Keen Nose: push a dog to the bottom if one is on top; otherwise leave the bin alone. */
function sniffChoice(cards: readonly Card[]): number | null {
  if (cards[0]?.kind === 'dog') return cards[0].id;
  if (cards[1]?.kind === 'dog') return cards[1].id;
  return null;
}

/** Scavenger: a discard-pile card that finishes a meal, or (late) the most useful one. */
function scavengeTarget(view: PlayerView, cards: readonly Card[]): Card | null {
  const finishing = cards.find((c) => completesMeal(view.hand, c));
  if (finishing) return finishing;
  if (view.round < T.scavenger.anyCardFromRound && !isLastRound(view)) return null;
  const ranked = [...cards].sort(
    (a, b) => cardValue(view, view.hand, b) - cardValue(view, view.hand, a),
  );
  return ranked[0] ?? null;
}

/** After sniffing, the bot knows the next card: dig if it is safe, stop if it is a dog. */
export function knownNextCard(view: PlayerView): Card | null {
  return view.peek?.decided ? (view.peek.cards[0] ?? null) : null;
}
