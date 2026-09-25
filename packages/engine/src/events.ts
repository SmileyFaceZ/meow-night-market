// Market events (GAME_RULES §15): one per round, revealed before the stall is laid out.
// Their numbers live in config.ts (GameConfig.events).

import type { GameState, PlayerId } from './types.ts';

export const EVENT_IDS = [
  'downpour',
  'seafoodFest',
  'milkDelivery',
  'garbageTruck',
  'blackout',
  'kindVendor',
  'bargainRush',
  'sleepyDogs',
  'gustyWind',
  'queueFlip',
  'busyNight',
  /** Only with cat powers on: every spent power comes back. */
  'fullMoon',
  /** Replaces the full moon when powers are off: snack meals do not lower the price. */
  'snackSale',
] as const;
export type EventId = (typeof EVENT_IDS)[number];

/** The 12 cards in play: the full moon only makes sense with powers (§15 #12). */
export function eventDeckFor(powers: boolean): EventId[] {
  return EVENT_IDS.filter((e) => (powers ? e !== 'snackSale' : e !== 'fullMoon'));
}

export interface EventState {
  /** Cards still to come — secret (the order is decided by the seed). */
  readonly deck: readonly EventId[];
  /** This round's event. */
  readonly current: EventId | null;
  /** Events of earlier rounds, oldest first (public). */
  readonly past: readonly EventId[];
}

export const currentEvent = (s: Pick<GameState, 'events'>): EventId | null =>
  s.events?.current ?? null;

/** Garbage Truck: the draw limit this turn, or null for none. */
export function digLimit(s: Pick<GameState, 'events' | 'config'>): number | null {
  return currentEvent(s) === 'garbageTruck' ? s.config.events.garbageTruckDigs : null;
}

/** The player sitting after `id` (Gusty Wind passes to them). */
export function nextSeat(players: GameState['players'], id: PlayerId): PlayerId {
  const i = players.findIndex((p) => p.id === id);
  return players[(i + 1) % players.length]!.id;
}
