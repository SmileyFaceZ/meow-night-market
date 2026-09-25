import type { EventId, GameConfig } from '@meow/engine';

// Market Mayhem helpers for the screen (GAME_RULES §14–15).

/** The numbers an event's one-line description needs (they come from the config). */
export function eventDescParams(event: EventId, config: GameConfig): Record<string, number> {
  switch (event) {
    case 'downpour':
      return { count: config.events.downpourDogs };
    case 'seafoodFest':
      return { bonus: config.events.seafoodBonus };
    case 'garbageTruck':
      return { count: config.events.garbageTruckDigs };
    case 'blackout':
      return { count: config.events.blackoutCards };
    default:
      return {};
  }
}
