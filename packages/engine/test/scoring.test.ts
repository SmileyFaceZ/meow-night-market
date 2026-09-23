import { describe, expect, it } from 'vitest';
import { DEFAULT_CONFIG, type FoodType } from '../src/config.ts';
import { scoreGame } from '../src/scoring.ts';
import type { Card, Meal, PlayerState } from '../src/types.ts';
import { cards } from './helpers.ts';

function meal(food: FoodType, points: number): Meal {
  return { round: 1, food, cards: [], big: false, price: points, points };
}
function p(id: string, meals: Meal[], hand: Card[] = []): PlayerState {
  return { id, seat: 0, meowLeft: [], hand, meals, picks: [] };
}
const score = (players: PlayerState[]) => scoreGame({ players, config: DEFAULT_CONFIG });
const line = (r: ReturnType<typeof score>, id: string) => r.scores.find((s) => s.playerId === id)!;

describe('§7 end of game and scoring', () => {
  it('total = sum of all meal points (+ bonus)', () => {
    const r = score([p('a', [meal('fish', 5), meal('fish', 8)]), p('b', [meal('milk', 4)])]);
    expect(line(r, 'a')).toMatchObject({ mealPoints: 13, varietyBonus: 0, total: 13 });
    expect(line(r, 'b').total).toBe(4);
    expect(r.winners).toEqual(['a']);
  });

  it('Foodie Bonus +3 goes to whoever ate the most food types', () => {
    const r = score([
      p('a', [meal('fish', 5), meal('milk', 5), meal('snack', 5)]),
      p('b', [meal('fish', 4), meal('shrimp', 4)]),
    ]);
    expect(line(r, 'a')).toMatchObject({ foodTypes: 3, varietyBonus: 3, total: 18 });
    expect(line(r, 'b').varietyBonus).toBe(0);
  });

  it('counts types, not meals (two fish meals = one type)', () => {
    const r = score([
      p('a', [meal('fish', 5), meal('fish', 4), meal('fish', 3)]),
      p('b', [meal('fish', 1), meal('milk', 1)]),
    ]);
    expect(line(r, 'a').foodTypes).toBe(1);
    expect(line(r, 'b')).toMatchObject({ foodTypes: 2, varietyBonus: 3 });
  });

  it('everyone tied for most types gets the bonus', () => {
    const r = score([
      p('a', [meal('fish', 1), meal('milk', 1)]),
      p('b', [meal('snack', 1), meal('shrimp', 1)]),
      p('c', [meal('fish', 1)]),
    ]);
    expect([line(r, 'a'), line(r, 'b'), line(r, 'c')].map((l) => l.varietyBonus)).toEqual([
      3, 3, 0,
    ]);
  });

  it('needs at least 2 types to earn the bonus', () => {
    const r = score([p('a', [meal('fish', 5)]), p('b', [])]);
    expect(line(r, 'a').varietyBonus).toBe(0);
  });

  it('a tie on points goes to whoever holds fewer cards (bones count)', () => {
    const r = score([
      p('a', [meal('fish', 5)], cards('bone', 'bone')),
      p('b', [meal('milk', 5)], cards('fish')),
    ]);
    expect(r.winners).toEqual(['b']);
    expect(line(r, 'a').handCount).toBe(2);
  });

  it('still tied → shared win', () => {
    const r = score([
      p('a', [meal('fish', 5)], cards('fish')),
      p('b', [meal('milk', 5)], cards('bone')),
      p('c', [meal('milk', 1)]),
    ]);
    expect(r.winners).toEqual(['a', 'b']);
  });

  it('nobody ate anything: everyone with the fewest cards shares the win', () => {
    const r = score([p('a', []), p('b', [])]);
    expect(r.winners).toEqual(['a', 'b']);
  });
});
