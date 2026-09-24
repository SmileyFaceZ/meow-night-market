import { describe, expect, it } from 'vitest';
import type { Scheduler } from '../src/game/LocalController';
import { TUTORIAL_STEPS, TutorialController } from '../src/game/tutorial';
import type { SeatInfo } from '../src/game/types';

function instantScheduler() {
  const queue: (() => void)[] = [];
  const scheduler: Scheduler = {
    setTimeout: (fn) => queue.push(fn),
    clearTimeout: () => {},
    random: () => 0,
  };
  return {
    scheduler,
    flush: () => {
      while (queue.length) queue.shift()!();
    },
  };
}

const seats: SeatInfo[] = [
  { id: 'p0', name: 'Tester', cat: 'calico', bot: null },
  { id: 'p1', name: null, cat: 'orange', bot: { personality: 'greedy', difficulty: 'normal' } },
];

describe('scripted tutorial', () => {
  it('plays the whole script: fish, bone, fish, dog, a meal, then a clash', () => {
    const { scheduler, flush } = instantScheduler();
    const tut = new TutorialController(seats, scheduler);
    const view = () => tut.getSnapshot().view;
    const step = () => tut.getTutorial().step?.id;
    const dug: string[] = [];

    expect(step()).toBe('welcome');
    // info steps refuse moves and need "Next"
    expect(tut.dispatch({ type: 'bid', playerId: 'p0', value: 5 })).toBe('tutorial.followCoach');
    tut.next();
    tut.next();
    expect(step()).toBe('bid');
    expect(tut.dispatch({ type: 'bid', playerId: 'p0', value: 1 })).toBe('tutorial.followCoach');
    expect(tut.dispatch({ type: 'bid', playerId: 'p0', value: 5 })).toBeNull();
    flush();

    expect(step()).toBe('pick');
    const fish = view().market.find((c) => c.kind === 'fish')!;
    expect(tut.dispatch({ type: 'pick', playerId: 'p0', cardId: fish.id })).toBeNull();
    flush();

    for (const id of ['dig1', 'dig2', 'dig3', 'dig4']) {
      expect(step()).toBe(id);
      expect(tut.getTutorial().ready).toBe(true);
      expect(tut.dispatch({ type: 'dig', playerId: 'p0' })).toBeNull();
      const e = tut
        .getSnapshot()
        .recentEvents.filter((ev) => ev.type === 'CARD_DUG')
        .at(-1);
      if (e?.type === 'CARD_DUG') dug.push(e.card.kind);
    }
    expect(dug).toEqual(['fish', 'bone', 'fish', 'dog']);

    expect(step()).toBe('bone');
    expect(tut.dispatch({ type: 'resolveDog', playerId: 'p0', useBone: true })).toBeNull();
    expect(step()).toBe('stop');
    expect(tut.dispatch({ type: 'stop', playerId: 'p0' })).toBeNull();
    flush();

    expect(step()).toBe('eat');
    const fishIds = view()
      .hand.filter((c) => c.kind === 'fish')
      .map((c) => c.id);
    expect(fishIds).toHaveLength(3);
    expect(tut.dispatch({ type: 'eat', playerId: 'p0', cardIds: fishIds })).toBeNull();
    flush();

    expect(step()).toBe('priceDrop');
    expect(view().prices.fish).toBe(4);
    tut.next();
    expect(step()).toBe('tieOrder');
    expect(tut.getTutorial().ready).toBe(true);
    tut.next();
    expect(tut.dispatch({ type: 'bid', playerId: 'p0', value: 3 })).toBeNull();
    flush();
    expect(step()).toBe('clash');
    expect(view().players.every((p) => p.clashed)).toBe(true);
    tut.next();
    expect(tut.getTutorial().step?.final).toBe(true);

    // after the script the game carries on as a normal solo game
    tut.finish();
    expect(tut.getTutorial().finished).toBe(true);
    expect(TUTORIAL_STEPS.length).toBeGreaterThan(10);
    tut.dispose();
  });
});
