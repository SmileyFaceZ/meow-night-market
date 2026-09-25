import type { GameResult } from '@meow/engine';
import { describe, expect, it } from 'vitest';
import { readSessionScore, recordSessionGame } from '../src/game/sessionScore';
import type { SeatInfo } from '../src/game/types';
import { memoryStorage } from './helpers';

const seats: SeatInfo[] = [
  { id: 'p0', name: 'Ann', cat: 'calico', bot: null },
  { id: 'p1', name: null, cat: 'orange', bot: { personality: 'greedy', difficulty: 'normal' } },
];
const won = (...winners: string[]): GameResult => ({ scores: [], winners });

describe('session score', () => {
  it('adds up wins game after game (a shared win counts for everyone)', () => {
    const storage = memoryStorage();
    recordSessionGame(storage, seats, won('p0'));
    recordSessionGame(storage, seats, won('p1'));
    const after = recordSessionGame(storage, seats, won('p0', 'p1'));
    expect(after).toMatchObject({ games: 3, wins: { p0: 2, p1: 2 } });
    expect(readSessionScore(storage, seats)).toEqual(after);
  });

  it('starts over for a different line-up', () => {
    const storage = memoryStorage();
    recordSessionGame(storage, seats, won('p0'));
    const harderBot = [
      seats[0]!,
      { ...seats[1]!, bot: { personality: 'greedy', difficulty: 'easy' } },
    ];
    expect(readSessionScore(storage, harderBot as SeatInfo[]).games).toBe(0);
    const renamed = [{ ...seats[0]!, name: 'Bo' }, seats[1]!];
    expect(readSessionScore(storage, renamed).games).toBe(0);
  });

  it('survives junk and missing storage', () => {
    const storage = memoryStorage();
    storage.setItem('mnm.session.v1', '{oops');
    expect(readSessionScore(storage, seats).games).toBe(0);
    expect(recordSessionGame(null, seats, won('p0')).games).toBe(1);
  });
});
