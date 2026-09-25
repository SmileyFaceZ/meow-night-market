import { browserStorage, type SaveStorage } from '../game/save';

// Sound settings (docs/ART_DIRECTION.md › เสียง): on by default, quietly. Kept per device.

export interface SoundSettings {
  /** Master switch: off = total silence. */
  readonly enabled: boolean;
  /** 0–1, applied to every sound. */
  readonly volume: number;
  /** Taps on buttons and cards. */
  readonly clicks: boolean;
  /** Game events: meows, barks, eating, the turn chime… */
  readonly effects: boolean;
}

export const DEFAULT_SOUND: SoundSettings = {
  enabled: true,
  volume: 0.4,
  clicks: true,
  effects: true,
};

const KEY = 'mnm.sound.v1';

/** Anything stored that does not look right falls back to the default for that field. */
export function parseSoundSettings(raw: string | null): SoundSettings {
  if (!raw) return DEFAULT_SOUND;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return DEFAULT_SOUND;
  }
  if (typeof data !== 'object' || data === null) return DEFAULT_SOUND;
  const d = data as Record<string, unknown>;
  const flag = (v: unknown, fallback: boolean) => (typeof v === 'boolean' ? v : fallback);
  const volume =
    typeof d.volume === 'number' && Number.isFinite(d.volume)
      ? Math.min(1, Math.max(0, d.volume))
      : DEFAULT_SOUND.volume;
  return {
    enabled: flag(d.enabled, DEFAULT_SOUND.enabled),
    volume,
    clicks: flag(d.clicks, DEFAULT_SOUND.clicks),
    effects: flag(d.effects, DEFAULT_SOUND.effects),
  };
}

/** A tiny store so the settings panel, the click listener and the game all agree. */
export function createSoundStore(storage: SaveStorage | null) {
  let settings = (() => {
    try {
      return parseSoundSettings(storage?.getItem(KEY) ?? null);
    } catch {
      return DEFAULT_SOUND;
    }
  })();
  const listeners = new Set<() => void>();
  return {
    get: (): SoundSettings => settings,
    set: (patch: Partial<SoundSettings>): void => {
      settings = parseSoundSettings(JSON.stringify({ ...settings, ...patch }));
      try {
        storage?.setItem(KEY, JSON.stringify(settings));
      } catch {
        // no storage: the setting lasts until the page closes
      }
      for (const listener of listeners) listener();
    },
    subscribe: (listener: () => void): (() => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export type SoundStore = ReturnType<typeof createSoundStore>;

export const soundStore: SoundStore = createSoundStore(
  typeof window === 'undefined' ? null : browserStorage(),
);
