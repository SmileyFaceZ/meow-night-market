import { describe, expect, it } from 'vitest';
import { botCats } from '../src/game/cats';
import { catClashes, seatsFromLocalSetup, seatsFromSetup } from '../src/game/setup';

const greedy = { personality: 'greedy', difficulty: 'normal' } as const;
const careful = { personality: 'careful', difficulty: 'normal' } as const;

describe('cats (every seat its own)', () => {
  it('lets bots keep their own cat when free, else the first free one', () => {
    expect(botCats(['calico'], [greedy, careful])).toEqual(['orange', 'white']);
    expect(botCats(['orange'], [greedy, greedy])).toEqual(['black', 'white']);
  });

  it('picks random free cats when powers are on', () => {
    const cats = botCats(['calico'], [greedy, greedy, careful], () => 0.99);
    expect(new Set([...cats, 'calico']).size).toBe(4);
    expect(cats).not.toContain('calico');
  });

  it('never repeats a cat at the table (solo and pass-and-play)', () => {
    const solo = seatsFromSetup({ name: 'A', cat: 'orange', bots: [greedy, greedy, careful] });
    expect(new Set(solo.map((s) => s.cat)).size).toBe(4);
    const local = seatsFromLocalSetup({
      players: [
        { kind: 'human', name: 'A', cat: 'white' },
        { kind: 'bot', bot: careful },
        { kind: 'human', name: 'B', cat: 'black' },
      ],
    });
    expect(local.map((s) => s.cat)).toEqual(['white', 'orange', 'black']);
  });

  it('flags people who picked the same cat', () => {
    const clashes = catClashes({
      players: [
        { kind: 'human', name: 'A', cat: 'korat' },
        { kind: 'human', name: 'B', cat: 'korat' },
      ],
    });
    expect([...clashes]).toEqual([1]);
  });
});
