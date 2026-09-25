import { chooseRandomAction, createRng, type PlayerView } from '@meow/engine';
import { describe, expect, it } from 'vitest';
import { type Handoff, humansToAct, nextHandoff } from '../src/game/handoff';
import { LocalController } from '../src/game/LocalController';
import { readSave } from '../src/game/save';
import {
  DEFAULT_LOCAL_SETUP,
  DEFAULT_SETUP,
  freeCat,
  humanCount,
  type LocalSetup,
  seatsFromLocalSetup,
  seatsFromSetup,
} from '../src/game/setup';
import { manualScheduler, memoryStorage } from './helpers';

const setup: LocalSetup = {
  players: [
    { kind: 'human', name: 'Ann', cat: 'calico' },
    { kind: 'bot', bot: { personality: 'sly', difficulty: 'normal' } },
    { kind: 'human', name: 'Bo', cat: 'orange' },
  ],
  mode: { powers: false, events: false },
};
const seats = seatsFromLocalSetup(setup);

interface Seen {
  readonly round: number;
  readonly phase: PlayerView['phase'];
  readonly handoff: Handoff;
}

/**
 * Plays a pass-and-play game: takes every handoff, plays the holder with random legal
 * moves, and checks after every step that the right person holds the device.
 */
function playShared(controller: LocalController, flush: () => void, seed: number) {
  const rng = createRng(seed);
  const handoffs: Seen[] = [];
  for (let step = 0; step < 20_000; step++) {
    flush();
    const snap = controller.getSnapshot();
    const state = controller.debugState;
    const waiting = humansToAct(state, seats);
    if (snap.handoff) {
      expect(waiting).toContain(snap.handoff.to);
      expect(snap.handoff.to).not.toBe(snap.view.viewer);
      expect(snap.handoff.secret).toBe(state.phase === 'bidding' || state.phase === 'discard');
      handoffs.push({ round: state.round, phase: state.phase, handoff: snap.handoff });
      controller.acceptHandoff();
      continue;
    }
    if (waiting.length > 0) expect(waiting).toContain(snap.view.viewer);
    if (snap.view.phase === 'gameOver') return { view: snap.view, handoffs };
    const action = chooseRandomAction(snap.view, rng);
    if (action) expect(controller.dispatch(action)).toBeNull();
  }
  throw new Error('game did not finish');
}

describe('pass-and-play handoff', () => {
  it('opens behind a cover for the first player', () => {
    const { scheduler } = manualScheduler();
    const controller = LocalController.newGame(seats, 'open', null, scheduler);
    const snap = controller.getSnapshot();
    expect(snap.sharedDevice).toBe(true);
    expect(snap.handoff).toEqual({ to: 'p0', secret: true });
    controller.acceptHandoff();
    expect(controller.getSnapshot().handoff).toBeNull();
    expect(controller.getSnapshot().view.viewer).toBe('p0');
    controller.dispose();
  });

  it('passes the device after a secret bid without showing it to the next player', () => {
    const { scheduler } = manualScheduler();
    const controller = LocalController.newGame(seats, 'bid', null, scheduler);
    controller.acceptHandoff();
    expect(controller.dispatch({ type: 'bid', playerId: 'p0', value: 4 })).toBeNull();

    const covered = controller.getSnapshot();
    expect(covered.handoff).toEqual({ to: 'p2', secret: true });
    // Under the cover the screen still belongs to p0 (their own bid), until p2 takes over.
    expect(covered.view.viewer).toBe('p0');

    controller.acceptHandoff();
    const view = controller.getSnapshot().view;
    expect(view.viewer).toBe('p2');
    expect(view.yourBid).toBeNull();
    const p0 = view.players.find((p) => p.id === 'p0')!;
    expect(p0.hasBid).toBe(true);
    expect(p0.revealedBid).toBeNull();
    controller.dispose();
  });

  it('ignores acceptHandoff when nobody is waiting for the device', () => {
    const { scheduler } = manualScheduler();
    const controller = LocalController.newGame(seats, 'noop', null, scheduler);
    controller.acceptHandoff();
    const before = controller.getSnapshot();
    controller.acceptHandoff();
    expect(controller.getSnapshot()).toBe(before);
    controller.dispose();
  });

  it.each([1, 2, 3])('plays whole games with the device always in the right hands (%i)', (seed) => {
    const { scheduler, flush } = manualScheduler();
    const controller = LocalController.newGame(seats, `full-${seed}`, null, scheduler);
    const { view, handoffs } = playShared(controller, flush, seed);
    expect(view.result?.scores).toHaveLength(3);
    expect(handoffs.some((h) => h.handoff.secret)).toBe(true);
    expect(handoffs.some((h) => !h.handoff.secret)).toBe(true);
    // Last round: everyone has one meow card left, so the app bids for them — no covers.
    const last = view.config.rounds;
    expect(handoffs.filter((h) => h.round === last && h.phase === 'bidding')).toEqual([]);
    controller.dispose();
  });

  it('with four people, every one of them gets the device to bid each round', () => {
    const four = seatsFromLocalSetup({
      players: (['calico', 'orange', 'black', 'white'] as const).map((cat, i) => ({
        kind: 'human' as const,
        name: `P${i}`,
        cat,
      })),
      mode: { powers: false, events: false },
    });
    const { scheduler } = manualScheduler();
    const controller = LocalController.newGame(four, 'four', null, scheduler);
    const holders: string[] = [];
    for (let i = 0; i < 4; i++) {
      const { handoff } = controller.getSnapshot();
      expect(handoff?.secret).toBe(true);
      controller.acceptHandoff();
      const viewer = controller.getSnapshot().view.viewer!;
      holders.push(viewer);
      expect(controller.dispatch({ type: 'bid', playerId: viewer, value: i + 1 })).toBeNull();
    }
    expect(holders).toEqual(['p0', 'p1', 'p2', 'p3']);
    expect(controller.getSnapshot().view.phase).toBe('pick');
    controller.dispose();
  });

  it('a resumed game reopens behind a cover for whoever must act', () => {
    const storage = memoryStorage();
    const { scheduler } = manualScheduler();
    const controller = LocalController.newGame(seats, 'resume', storage, scheduler);
    controller.acceptHandoff();

    // Holder p0 still has to bid: the cover goes back up for p0.
    let resumed = LocalController.fromSave(readSave(storage)!, null, manualScheduler().scheduler);
    expect(resumed.getSnapshot().handoff).toEqual({ to: 'p0', secret: true });
    resumed.dispose();

    // p0 has bid; p2 must bid next.
    controller.dispatch({ type: 'bid', playerId: 'p0', value: 2 });
    resumed = LocalController.fromSave(readSave(storage)!, null, manualScheduler().scheduler);
    expect(resumed.getSnapshot().handoff).toEqual({ to: 'p2', secret: true });
    resumed.dispose();
    controller.dispose();
  });

  it('keeps the device with the holder while only bots play', () => {
    const { scheduler } = manualScheduler();
    const controller = LocalController.newGame(seats, 'bots', null, scheduler);
    const state = controller.debugState;
    const allBid = {
      ...state,
      bids: { p0: 1, p1: null, p2: 3 },
    };
    expect(nextHandoff(allBid, seats, 'p2')).toBeNull();
    expect(nextHandoff(allBid, seats, 'p0')).toBeNull();
    controller.dispose();
  });
});

describe('solo play has no handoffs', () => {
  it('never covers the screen', () => {
    const { scheduler, flush } = manualScheduler();
    const controller = LocalController.newGame(seatsFromSetup(DEFAULT_SETUP), 's', null, scheduler);
    expect(controller.getSnapshot().sharedDevice).toBe(false);
    const rng = createRng(9);
    for (let step = 0; step < 5000; step++) {
      flush();
      const snap = controller.getSnapshot();
      expect(snap.handoff).toBeNull();
      if (snap.view.phase === 'gameOver') break;
      const action = chooseRandomAction(snap.view, rng);
      if (action) controller.dispatch(action);
    }
    expect(controller.getSnapshot().view.phase).toBe('gameOver');
    controller.dispose();
  });
});

describe('pass-and-play setup', () => {
  it('turns the setup into seats in order, bots with their own cat', () => {
    expect(seats).toEqual([
      { id: 'p0', name: 'Ann', cat: 'calico', bot: null },
      { id: 'p1', name: null, cat: 'black', bot: { personality: 'sly', difficulty: 'normal' } },
      { id: 'p2', name: 'Bo', cat: 'orange', bot: null },
    ]);
  });

  it('counts humans and suggests a cat nobody has', () => {
    expect(humanCount(DEFAULT_LOCAL_SETUP)).toBe(2);
    expect(freeCat(DEFAULT_LOCAL_SETUP)).toBe('black');
    expect(humanCount(setup)).toBe(2);
  });
});
