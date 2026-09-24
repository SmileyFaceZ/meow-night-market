import { chooseRandomAction, createRng, getPlayerView } from '@meow/engine';
import { describe, expect, it } from 'vitest';
import { LocalController, type Scheduler } from '../src/game/LocalController';
import { readSave, type SaveStorage } from '../src/game/save';
import { seatsFromSetup, DEFAULT_SETUP } from '../src/game/setup';
import type { SeatInfo } from '../src/game/types';

/** Timers that only run when the test says so. */
function manualScheduler() {
  const queue: { fn: () => void; handle: number }[] = [];
  let next = 1;
  const scheduler: Scheduler = {
    setTimeout: (fn) => {
      const handle = next++;
      queue.push({ fn, handle });
      return handle;
    },
    clearTimeout: (handle) => {
      const i = queue.findIndex((q) => q.handle === handle);
      if (i >= 0) queue.splice(i, 1);
    },
    random: () => 0.5,
  };
  const flush = () => {
    let guard = 0;
    while (queue.length > 0) {
      queue.shift()!.fn();
      if (++guard > 10_000) throw new Error('timer loop');
    }
  };
  return { scheduler, flush, pending: () => queue.length };
}

function memoryStorage(): SaveStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const seats: SeatInfo[] = seatsFromSetup({
  ...DEFAULT_SETUP,
  name: 'Tester',
  bots: [
    { personality: 'greedy', difficulty: 'normal' },
    { personality: 'sly', difficulty: 'easy' },
    { personality: 'careful', difficulty: 'normal' },
  ],
});

/** Plays the human seat with random legal moves until the game ends. */
function playToEnd(controller: LocalController, flush: () => void, seed = 1) {
  const rng = createRng(seed);
  for (let step = 0; step < 5000; step++) {
    flush();
    const { view } = controller.getSnapshot();
    if (view.phase === 'gameOver') return view;
    const action = chooseRandomAction(view, rng);
    if (action) expect(controller.dispatch(action)).toBeNull();
  }
  throw new Error('game did not finish');
}

describe('LocalController (solo)', () => {
  it('plays a full game against three bots', () => {
    const { scheduler, flush } = manualScheduler();
    const controller = LocalController.newSolo(seats, 'full', null, scheduler);
    const view = playToEnd(controller, flush);
    expect(view.result?.scores).toHaveLength(4);
    controller.dispose();
  });

  it('only ever exposes the human seat’s view', () => {
    const { scheduler } = manualScheduler();
    const controller = LocalController.newSolo(seats, 'view', null, scheduler);
    const { view } = controller.getSnapshot();
    expect(view.viewer).toBe('p0');
    expect(view).toEqual(getPlayerView(controller.debugState, 'p0'));
    expect(view).not.toHaveProperty('trashDeck');
  });

  it('bots wait for their turn with a delay; the human is never auto-played early', () => {
    const { scheduler, pending } = manualScheduler();
    const controller = LocalController.newSolo(seats, 'delay', null, scheduler);
    // bidding: three bots scheduled, none has moved yet
    expect(pending()).toBe(3);
    expect(controller.getSnapshot().view.players.filter((p) => p.hasBid)).toHaveLength(0);
  });

  it('rejected actions return an i18n error key and change nothing', () => {
    const { scheduler } = manualScheduler();
    const controller = LocalController.newSolo(seats, 'err', null, scheduler);
    const before = controller.getSnapshot();
    expect(controller.dispatch({ type: 'dig', playerId: 'p0' })).toBe('error.wrongPhase');
    expect(controller.getSnapshot()).toBe(before);
  });

  it('notifies subscribers on every change', () => {
    const { scheduler, flush } = manualScheduler();
    const controller = LocalController.newSolo(seats, 'sub', null, scheduler);
    let calls = 0;
    const unsubscribe = controller.subscribe(() => calls++);
    controller.dispatch({ type: 'bid', playerId: 'p0', value: 3 });
    flush();
    expect(calls).toBeGreaterThanOrEqual(4);
    unsubscribe();
  });

  it('plays the last meow card for the human automatically', () => {
    const { scheduler, flush } = manualScheduler();
    const controller = LocalController.newSolo(seats, 'last', null, scheduler);
    const rng = createRng(2);
    while (controller.getSnapshot().view.round < 5) {
      flush();
      const action = chooseRandomAction(controller.getSnapshot().view, rng);
      if (action) controller.dispatch(action);
    }
    flush();
    const me = controller.getSnapshot().view.players.find((p) => p.id === 'p0')!;
    expect(me.meowLeft).toHaveLength(0);
  });
});

describe('save & resume', () => {
  it('saves after every change and resumes exactly where it left off', () => {
    const storage = memoryStorage();
    const { scheduler, flush } = manualScheduler();
    const controller = LocalController.newSolo(seats, 'save', storage, scheduler);
    controller.dispatch({ type: 'bid', playerId: 'p0', value: 4 });
    flush();
    const save = readSave(storage);
    expect(save).not.toBeNull();
    expect(save!.state).toEqual(controller.debugState);
    controller.dispose();

    const resumed = LocalController.fromSave(save!, storage, manualScheduler().scheduler);
    expect(resumed.getSnapshot().view).toEqual(getPlayerView(save!.state, 'p0'));
  });

  it('a resumed game finishes normally and the save is cleared at the end', () => {
    const storage = memoryStorage();
    const first = manualScheduler();
    const controller = LocalController.newSolo(seats, 'resume', storage, first.scheduler);
    controller.dispatch({ type: 'bid', playerId: 'p0', value: 2 });
    controller.dispose();
    const second = manualScheduler();
    const resumed = LocalController.fromSave(readSave(storage)!, storage, second.scheduler);
    playToEnd(resumed, second.flush, 3);
    expect(readSave(storage)).toBeNull();
  });

  it('ignores missing, corrupt or foreign saves', () => {
    const storage = memoryStorage();
    expect(readSave(storage)).toBeNull();
    storage.setItem('mnm.solo.v1', '{not json');
    expect(readSave(storage)).toBeNull();
    storage.setItem('mnm.solo.v1', JSON.stringify({ v: 99 }));
    expect(readSave(storage)).toBeNull();
    const throwing: SaveStorage = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('blocked');
      },
      removeItem: () => {},
    };
    expect(readSave(throwing)).toBeNull();
    // a game still runs when storage throws
    const { scheduler, flush } = manualScheduler();
    const controller = LocalController.newSolo(seats, 'blocked', throwing, scheduler);
    expect(controller.dispatch({ type: 'bid', playerId: 'p0', value: 1 })).toBeNull();
    flush();
  });
});
