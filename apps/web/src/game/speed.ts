import { DEFAULT_SPEED, GAME_SPEEDS, type GameSpeed } from '@meow/protocol';
import { useSyncExternalStore } from 'react';
import { browserStorage, type SaveStorage } from './save';

// Game speed for solo / pass-and-play, kept per device (online the host picks it).
// DECISIONS 051: it stretches reading time, toasts and bot thinking — popups never < 3 s.

const KEY = 'mnm.speed.v1';

export function parseSpeed(raw: string | null): GameSpeed {
  return GAME_SPEEDS.find((s) => s === raw) ?? DEFAULT_SPEED;
}

export function createSpeedStore(storage: SaveStorage | null) {
  let speed = (() => {
    try {
      return parseSpeed(storage?.getItem(KEY) ?? null);
    } catch {
      return DEFAULT_SPEED;
    }
  })();
  const listeners = new Set<() => void>();
  return {
    get: (): GameSpeed => speed,
    set: (next: GameSpeed): void => {
      speed = next;
      try {
        storage?.setItem(KEY, next);
      } catch {
        // no storage: lasts until the page closes
      }
      for (const listener of listeners) listener();
    },
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type SpeedStore = ReturnType<typeof createSpeedStore>;

export const speedStore: SpeedStore = createSpeedStore(
  typeof window === 'undefined' ? null : browserStorage(),
);

export function useLocalSpeed(): GameSpeed {
  return useSyncExternalStore(speedStore.subscribe, speedStore.get, speedStore.get);
}
