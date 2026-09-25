import { useSyncExternalStore } from 'react';
import { type SoundSettings, soundStore } from './settings';

/** The current sound settings; re-renders when they change. */
export function useSoundSettings(): SoundSettings {
  return useSyncExternalStore(soundStore.subscribe, soundStore.get);
}
