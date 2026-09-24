import { useCallback, useEffect, useRef, useState } from 'react';
import { useSnapshot } from './hooks';
import { type Beat, beatDuration, isBlocking, newEvents, toBeats } from './stage';
import type { GameController } from './types';

export interface StagedBeat {
  readonly id: number;
  readonly beat: Beat;
  readonly blocking: boolean;
  readonly duration: number;
}

/**
 * Plays new game events as beats, one at a time, and holds the game (bots wait)
 * until they have been shown. History from before the screen opened is not replayed.
 */
export function useStage(controller: GameController) {
  const snapshot = useSnapshot(controller);
  const viewer = snapshot.view.viewer;
  const seen = useRef(snapshot.eventCount);
  const nextId = useRef(1);
  // A fresh (or just resumed) game opens with the round banner and its tie-break order.
  const [queue, setQueue] = useState<StagedBeat[]>(() => {
    const { view } = snapshot;
    if (snapshot.eventCount > 0 || view.phase !== 'bidding' || view.players.some((p) => p.hasBid)) {
      return [];
    }
    const beat: Beat = { kind: 'round', round: view.round, tieOrder: view.tieOrder };
    return [{ id: 0, beat, blocking: true, duration: beatDuration(beat, viewer) }];
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
    if (beats.length > 0) setQueue((q) => [...q, ...beats]);
  }, [snapshot.eventCount, snapshot.recentEvents, viewer]);

  const busy = queue.length > 0;
  useEffect(() => {
    controller.setPaused(busy);
  }, [controller, busy]);
  useEffect(() => () => controller.setPaused(false), [controller]);

  const current = queue[0] ?? null;
  const advance = useCallback(() => setQueue((q) => q.slice(1)), []);

  useEffect(() => {
    if (!current) return;
    const timer = window.setTimeout(advance, current.duration);
    return () => window.clearTimeout(timer);
  }, [current, advance]);

  return {
    current,
    /** Beats still waiting after the current one. */
    queued: Math.max(0, queue.length - 1),
    skip: advance,
  };
}
