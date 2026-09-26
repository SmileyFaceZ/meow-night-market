import { describe, expect, it } from 'vitest';
import { botCats } from '../src/game/cats';
import {
  catClashes,
  DEFAULT_SETUP,
  localTakeCat,
  newBot,
  seatsFromLocalSetup,
  seatsFromSetup,
  soloTakeCat,
} from '../src/game/setup';

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
    const solo = seatsFromSetup({
      name: 'A',
      cat: 'orange',
      bots: [greedy, greedy, careful],
      mode: { powers: false, events: false },
    });
    expect(new Set(solo.map((s) => s.cat)).size).toBe(4);
    const local = seatsFromLocalSetup({
      players: [
        { kind: 'human', name: 'A', cat: 'white' },
        { kind: 'bot', bot: careful },
        { kind: 'human', name: 'B', cat: 'black' },
      ],
      mode: { powers: false, events: false },
    });
    expect(local.map((s) => s.cat)).toEqual(['white', 'orange', 'black']);
  });

  it('flags people who picked the same cat', () => {
    const clashes = catClashes({
      players: [
        { kind: 'human', name: 'A', cat: 'korat' },
        { kind: 'human', name: 'B', cat: 'korat' },
      ],
      mode: { powers: false, events: false },
    });
    expect([...clashes]).toEqual([1]);
  });
});

describe('waiting room cats (DECISIONS 052)', () => {
  const seq = (...values: number[]) => {
    let i = 0;
    return () => values[i++ % values.length]!;
  };

  it('a new bot gets a random personality and a free cat; only the difficulty is chosen', () => {
    const bot = newBot('easy', ['calico', 'orange'], seq(0.99, 0));
    expect(bot).toEqual({ personality: 'careful', difficulty: 'easy', cat: 'black' });
  });

  it('solo: taking a bot’s cat makes that bot draw another free cat', () => {
    const setup = {
      ...DEFAULT_SETUP,
      cat: 'calico' as const,
      bots: [
        { personality: 'greedy' as const, difficulty: 'normal' as const, cat: 'korat' as const },
        { personality: 'sly' as const, difficulty: 'normal' as const, cat: 'tabby' as const },
      ],
    };
    const next = soloTakeCat(setup, 'korat', () => 0);
    const cats = seatsFromSetup(next).map((s) => s.cat);
    expect(cats[0]).toBe('korat');
    expect(cats[2]).toBe('tabby'); // the other bot keeps its cat
    expect(new Set(cats).size).toBe(3);
  });

  it('older solo setups without bot cats still get one each', () => {
    const cats = seatsFromSetup(DEFAULT_SETUP).map((s) => s.cat);
    expect(new Set(cats).size).toBe(cats.length);
  });

  it('pass-and-play: a person cannot take another person’s cat, but can take a bot’s', () => {
    const setup = {
      mode: { powers: true, events: false },
      players: [
        { kind: 'human' as const, name: 'A', cat: 'calico' as const },
        { kind: 'human' as const, name: 'B', cat: 'orange' as const },
        {
          kind: 'bot' as const,
          bot: { personality: 'sly' as const, difficulty: 'easy' as const },
          cat: 'white' as const,
        },
      ],
    };
    expect(localTakeCat(setup, 1, 'calico')).toBeNull();
    const next = localTakeCat(setup, 1, 'white', () => 0)!;
    const cats = seatsFromLocalSetup(next).map((s) => s.cat);
    expect(cats[1]).toBe('white');
    expect(cats[2]).not.toBe('white');
    expect(new Set(cats).size).toBe(3);
  });
});
