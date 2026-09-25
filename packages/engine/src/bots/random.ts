import { findMealOptions } from '../cards.ts';
import { FOOD_TYPES } from '../config.ts';
import { pairOptions, type PowerUse, scavengeable } from '../powers.ts';
import type { Rng } from '../rng.ts';
import type { Action } from '../types.ts';
import type { PlayerView } from '../view.ts';

/**
 * Makes a random legal move for the viewer, or returns null if the game is not
 * waiting on them. Uses only the player view (no peeking), like every bot.
 * Not one of the three personalities — used by the property tests and the simulator.
 */
export function chooseRandomAction(view: PlayerView, rng: Rng): Action | null {
  const playerId = view.viewer;
  if (playerId === null) return null;
  const me = view.players.find((p) => p.id === playerId);
  if (!me) return null;
  const myTurn = view.currentPlayer === playerId;

  const pickOne = <T>(items: readonly T[]): T => items[rng.int(items.length)] as T;

  // Cat powers: answer open windows; now and then use a power at random.
  if (view.powerWindow) {
    if (view.powerWindow.playerId !== playerId) return null;
    const use = randomUse(view, me, rng);
    return use && rng.next() < 0.5
      ? { type: 'usePower', playerId, use }
      : { type: 'passPower', playerId };
  }
  if (view.canUsePower && rng.next() < 0.3) {
    const use = randomUse(view, me, rng);
    if (use) return { type: 'usePower', playerId, use };
  }

  switch (view.phase) {
    case 'bidding':
      return me.hasBid ? null : { type: 'bid', playerId, value: pickOne(me.meowLeft) };

    case 'pick':
      return myTurn
        ? {
            type: 'pick',
            playerId,
            cardId: pickOne([...view.market.map((c) => c.id), ...view.faceDownMarket]),
          }
        : null;

    case 'trash':
      if (!myTurn) return null;
      if (view.pendingDog) {
        const hasBone = view.hand.some((c) => c.kind === 'bone');
        return { type: 'resolveDog', playerId, useBone: hasBone && rng.next() < 0.7 };
      }
      return view.trashDiggable && rng.next() < 0.6
        ? { type: 'dig', playerId }
        : { type: 'stop', playerId };

    case 'eat': {
      if (!myTurn) return null;
      const options = findMealOptions(view.hand, view.config);
      return options.length > 0 && rng.next() < 0.8
        ? { type: 'eat', playerId, cardIds: pickOne(options).cardIds }
        : { type: 'finishEating', playerId };
    }

    case 'discard':
      if (me.mustDiscard === 0 || me.hasDiscarded) return null;
      return {
        type: 'discard',
        playerId,
        cardIds: rng
          .shuffle(view.hand)
          .slice(0, me.mustDiscard)
          .map((c) => c.id),
      };

    case 'pass':
      return me.mustPass && !me.hasPassed
        ? { type: 'passCard', playerId, cardId: pickOne(view.hand).id }
        : null;

    case 'gameOver':
      return null;
  }
}

/** A random use of the viewer's power that is legal right now (null if it needs no target and none fits). */
function randomUse(view: PlayerView, me: PlayerView['players'][number], rng: Rng): PowerUse | null {
  const one = <T>(items: readonly T[]): T | undefined =>
    items.length > 0 ? items[rng.int(items.length)] : undefined;
  switch (me.power) {
    case 'keenNose':
    case 'goodLuck':
    case 'extraOrder':
      return { power: me.power };
    case 'secondThought': {
      const bid = me.revealedBid;
      const value = one(
        bid === null ? [] : [bid - 1, bid + 1].filter((v) => me.meowLeft.includes(v)),
      );
      return value === undefined ? null : { power: 'secondThought', value };
    }
    case 'luckySwap': {
      const card = one(view.market);
      return card ? { power: 'luckySwap', cardId: card.id } : null;
    }
    case 'scavenger': {
      const card = one(scavengeable(view.discard));
      return card ? { power: 'scavenger', cardId: card.id } : null;
    }
    case 'haggle': {
      const food = one(FOOD_TYPES.filter((f) => view.prices[f] < view.config.startPrice));
      return food ? { power: 'haggle', food } : null;
    }
    case 'bigAppetite': {
      const pair = one(pairOptions(view.hand));
      return pair ? { power: 'bigAppetite', cardIds: pair.cardIds } : null;
    }
    default:
      return null;
  }
}
