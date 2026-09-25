import type { Scheduler } from '../src/game/LocalController';
import type { SaveStorage } from '../src/game/save';

/** Timers that only run when the test says so. */
export function manualScheduler() {
  const queue: { fn: () => void; handle: number; ms: number }[] = [];
  let next = 1;
  const scheduler: Scheduler = {
    setTimeout: (fn, ms) => {
      const handle = next++;
      queue.push({ fn, handle, ms });
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
  /** The shortest pending delay, if any. */
  const nextDelay = () => Math.min(...queue.map((q) => q.ms));
  /** Run only the timer with the shortest delay. */
  const flushNext = () => {
    const i = queue.findIndex((q) => q.ms === nextDelay());
    if (i >= 0) queue.splice(i, 1)[0]!.fn();
  };
  return { scheduler, flush, flushNext, nextDelay, pending: () => queue.length };
}

export function memoryStorage(): SaveStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}
