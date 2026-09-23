import { findMealOptions } from '../cards.ts';
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

  switch (view.phase) {
    case 'bidding':
      return me.hasBid ? null : { type: 'bid', playerId, value: pickOne(me.meowLeft) };

    case 'pick':
      return myTurn ? { type: 'pick', playerId, cardId: pickOne(view.market).id } : null;

    case 'trash':
      if (!myTurn) return null;
      if (view.pendingDog) return { type: 'resolveDog', playerId, useBone: rng.next() < 0.7 };
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

    case 'gameOver':
      return null;
  }
}
