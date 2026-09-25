import { useCallback, useEffect, useReducer, useRef } from 'react';
import { useSnapshot } from './hooks';
import {
  type Beat,
  beatDuration,
  isBlocking,
  type Moods,
  moodsWhenBeatEnds,
  moodsWhenBeatStarts,
  newEvents,
  toBeats,
} from './stage';
import type { GameController } from './types';

export interface StagedBeat {
  readonly id: number;
  readonly beat: Beat;
  readonly blocking: boolean;
  readonly duration: number;
}

interface StageState {
  readonly queue: readonly StagedBeat[];
  /** Cat faces after every beat shown so far (the current beat is applied on top). */
  readonly settled: Moods;
}

type StageAction = { type: 'enqueue'; beats: StagedBeat[] } | { type: 'advance' };

function reducer(state: StageState, action: StageAction): StageState {
  switch (action.type) {
    case 'enqueue':
      return action.beats.length ? { ...state, queue: [...state.queue, ...action.beats] } : state;
    case 'advance': {
      const [done, ...rest] = state.queue;
      if (!done) return state;
      return {
        queue: rest,
        settled: moodsWhenBeatEnds(moodsWhenBeatStarts(state.settled, done.beat)),
      };
    }
  }
}

/**
 * Plays new game events as beats, one at a time, and holds the game (bots wait)
 * until they have been shown. History from before the screen opened is not replayed.
 * `held` freezes the current beat (pass-and-play cover is up: nobody is watching).
 */
export function useStage(controller: GameController, held = false) {
  const snapshot = useSnapshot(controller);
  const viewer = snapshot.view.viewer;
  const seen = useRef(snapshot.eventCount);
  const nextId = useRef(1);

  // A fresh (or just resumed) game opens with the round banner and its tie-break order.
  const [state, dispatch] = useReducer(reducer, snapshot, (snap): StageState => {
    const { view } = snap;
    if (snap.eventCount > 0 || view.phase !== 'bidding' || view.players.some((p) => p.hasBid)) {
      return { queue: [], settled: {} };
    }
    const beat: Beat = { kind: 'round', round: view.round, tieOrder: view.tieOrder };
    return {
      queue: [{ id: 0, beat, blocking: true, duration: beatDuration(beat, view.viewer) }],
      settled: {},
    };
  });

  useEffect(() => {
    const fresh = newEvents(snapshot.recentEvents, snapshot.eventCount, seen.current);
    seen.current = snapshot.eventCount;
    const beats = toBeats(fresh).map((beat) => ({
      id: nextId.current++,
      beat,
      blocking: isBlocking(beat, viewer),
      duration: beatDuration(beat, viewer),
    }));
    if (beats.length > 0) dispatch({ type: 'enqueue', beats });
  }, [snapshot.eventCount, snapshot.recentEvents, viewer]);

  const busy = state.queue.length > 0;
  useEffect(() => {
    controller.setPaused(busy);
  }, [controller, busy]);
  useEffect(() => () => controller.setPaused(false), [controller]);

  const current = state.queue[0] ?? null;
  const advance = useCallback(() => dispatch({ type: 'advance' }), []);

  useEffect(() => {
    if (!current || held) return;
    const timer = window.setTimeout(advance, current.duration);
    return () => window.clearTimeout(timer);
  }, [current, advance, held]);

  return {
    current,
    /** Beats still waiting after the current one. */
    queued: Math.max(0, state.queue.length - 1),
    /** Cat faces right now: everything shown so far plus the beat on screen. */
    moods: current ? moodsWhenBeatStarts(state.settled, current.beat) : state.settled,
    skip: advance,
  };
}
