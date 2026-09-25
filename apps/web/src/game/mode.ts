import type { GameMode } from '@meow/protocol';

/** Which rule set a mode is (GAME_RULES §12). */
export function modeName(mode: GameMode): 'classic' | 'chaos' | 'powers' | 'events' {
  if (mode.powers && mode.events) return 'chaos';
  if (mode.powers) return 'powers';
  if (mode.events) return 'events';
  return 'classic';
}
