import type { ReadLang } from '@meow/protocol';
import { useCallback, useEffect, useReducer, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { soundForBeat } from '../audio/cues';
import { playSound } from '../audio/sound';
import { useSnapshot } from './hooks';
import {
  type Beat,
  beatDuration,
  isBlocking,
  isPinned,
  openingBeats,
  type Pace,
  type Moods,
  moodsWhenBeatEnds,
  moodsWhenBeatStarts,
  newEvents,
  toBeats,
} from './stage';
import { useLocalSpeed } from './speed';
import type { GameController } from './types';

export interface StagedBeat {
  readonly id: number;
  readonly beat: Beat;
  readonly blocking: boolean;
  /** Waits for "Got it" (solo / pass-and-play, rules-changing popups): no timer. */
  readonly pinned: boolean;
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
 * Plays new game events as beats, one at a time (never on top of each other), and holds
 * the game (bots wait) until they have been shown. History from before the screen opened
 * is not replayed. `held` freezes the current beat (pass-and-play cover is up).
 * Popups last at least 3 s, longer with more to read (DECISIONS 051); in solo and
 * pass-and-play the rules-changing ones wait for "Got it".
 */
export function useStage(controller: GameController, held = false) {
  const snapshot = useSnapshot(controller);
  const viewer = snapshot.view.viewer;
  const seen = useRef(snapshot.eventCount);
  const nextId = useRef(1);
  const { i18n } = useTranslation();
  const localSpeed = useLocalSpeed();
  const pace: Pace = {
    speed: snapshot.online?.speed ?? localSpeed,
    lang: (i18n.language?.startsWith('en') ? 'en' : 'th') satisfies ReadLang,
  };
  const pinnable = !snapshot.online;
  const stage = (beat: Beat, id: number): StagedBeat => ({
    id,
    beat,
    blocking: isBlocking(beat, viewer),
    pinned: pinnable && isPinned(beat),
    duration: beatDuration(beat, viewer, pace),
  });

  // A fresh (or just resumed) game opens with its first event card and the round banner.
  const [state, dispatch] = useReducer(reducer, snapshot, (snap): StageState => {
    const { view } = snap;
    if (snap.eventCount > 0 || view.phase !== 'bidding' || view.players.some((p) => p.hasBid)) {
      return { queue: [], settled: {} };
    }
    return { queue: openingBeats(view).map((beat, i) => stage(beat, -1 - i)), settled: {} };
  });

  useEffect(() => {
    const fresh = newEvents(snapshot.recentEvents, snapshot.eventCount, seen.current);
    seen.current = snapshot.eventCount;
    const beats = toBeats(fresh).map((beat) => stage(beat, nextId.current++));
    if (beats.length > 0) dispatch({ type: 'enqueue', beats });
    // `stage` only reads the pace, which is fixed when a beat is queued.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot.eventCount, snapshot.recentEvents, viewer]);

  const busy = state.queue.length > 0;
  useEffect(() => {
    controller.setPaused(busy);
  }, [controller, busy]);
  useEffect(() => () => controller.setPaused(false), [controller]);

  const current = state.queue[0] ?? null;
  const advance = useCallback(() => dispatch({ type: 'advance' }), []);

  // Each beat makes its sound as it appears (not while the pass-and-play cover is up).
  const sounded = useRef(-1);
  useEffect(() => {
    if (!current || held || sounded.current === current.id) return;
    sounded.current = current.id;
    const sound = soundForBeat(current.beat, viewer);
    if (sound) playSound(sound);
  }, [current, held, viewer]);

  useEffect(() => {
    if (!current || held || current.pinned) return;
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
