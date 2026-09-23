import { describe, expect, it } from 'vitest';
import { computeTurnOrder, startPlayer, startSeatForRound } from '../src/rules.ts';
import { getPlayerView } from '../src/view.ts';
import { act, bidAll, newGame, patch, player } from './helpers.ts';
import type { GameState } from '../src/types.ts';

function finishRound(s: GameState): GameState {
  while (s.phase !== 'bidding' && s.phase !== 'gameOver') {
    if (s.phase === 'pick') {
      s = act(s, { type: 'pick', playerId: s.pickQueue[0]!, cardId: s.market[0]!.id }).state;
    } else {
      const who = s.turnOrder[s.turnIndex]!;
      s = act(s, { type: s.phase === 'trash' ? 'stop' : 'finishEating', playerId: who }).state;
    }
  }
  return s;
}

describe('§5/§6 turn order for Trash Dig and Feast Time', () => {
  it('orders everyone by bid, lowest first — clashed players included', () => {
    const s = bidAll(patch(newGame(4), { firstStartSeat: 0 }), { a: 5, b: 3, c: 3, d: 1 }).state;
    expect(s.turnOrder).toEqual(['d', 'b', 'c', 'a']);
  });

  it('breaks ties by seat, counting the round start player first, then clockwise', () => {
    // start seat 2 (c): seat ranks c=0, d=1, a=2, b=3
    const s = bidAll(patch(newGame(4), { firstStartSeat: 2 }), { a: 2, b: 2, c: 4, d: 2 }).state;
    expect(s.turnOrder).toEqual(['d', 'a', 'b', 'c']);
  });

  it('the tied start player goes first among the tied', () => {
    const players = newGame(3).players;
    expect(computeTurnOrder(players, { a: 1, b: 1, c: 1 }, 1)).toEqual(['b', 'c', 'a']);
  });

  it('eat phase uses the same order as the trash phase', () => {
    let s = bidAll(patch(newGame(3), { firstStartSeat: 0 }), { a: 3, b: 3, c: 1 }).state;
    const order = [...s.turnOrder];
    s = act(s, { type: 'pick', playerId: 'c', cardId: s.market[0]!.id }).state;
    for (const who of order) s = act(s, { type: 'stop', playerId: who }).state;
    expect(s.phase).toBe('eat');
    expect(s.turnOrder).toEqual(order);
    expect(s.turnOrder[s.turnIndex]).toBe('c');
  });
});

describe('§3.7 start player rotates clockwise every round', () => {
  it('moves one seat per round and wraps around', () => {
    expect([1, 2, 3, 4, 5].map((r) => startSeatForRound(2, r, 3))).toEqual([2, 0, 1, 2, 0]);
  });

  it('is applied through a real game and visible in the player view', () => {
    let s = patch(newGame(3), { firstStartSeat: 1 });
    const seen: string[] = [];
    for (let round = 1; round <= 3; round++) {
      expect(s.round).toBe(round);
      seen.push(startPlayer(s));
      expect(getPlayerView(s, 'a').startPlayer).toBe(startPlayer(s));
      const value = player(s, 'a').meowLeft[0]!;
      s = finishRound(bidAll(s, { a: value, b: value, c: value }).state);
    }
    expect(seen).toEqual(['b', 'c', 'a']);
  });

  it('decides clash ties with the rotated start player', () => {
    let s = patch(newGame(3), { firstStartSeat: 0 });
    s = finishRound(bidAll(s, { a: 1, b: 1, c: 1 }).state);
    // round 2: start seat 1 (b)
    s = bidAll(s, { a: 2, b: 2, c: 2 }).state;
    expect(s.turnOrder).toEqual(['b', 'c', 'a']);
  });
});
