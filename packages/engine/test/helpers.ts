import { expect } from 'vitest';
import { applyAction } from '../src/actions.ts';
import { chooseRandomAction } from '../src/bots/random.ts';
import { createRng } from '../src/rng.ts';
import { pendingActors } from '../src/rules.ts';
import type { GameConfig } from '../src/config.ts';
import type { CatId } from '../src/powers.ts';
import { createGame } from '../src/setup.ts';
import { getPlayerView } from '../src/view.ts';
import type {
  Action,
  Card,
  CardKind,
  ErrorKey,
  GameEvent,
  GameState,
  PlayerState,
} from '../src/types.ts';

export const P = ['a', 'b', 'c', 'd'] as const;

export function newGame(players = 3, seed: number | string = 'test'): GameState {
  return createGame({ playerIds: P.slice(0, players), seed });
}

let nextId = 1000;
/** A card that does not collide with the ids of a real deck. */
export function card(kind: CardKind): Card {
  return { id: nextId++, kind };
}
export function cards(...kinds: CardKind[]): Card[] {
  return kinds.map(card);
}

export function patch(state: GameState, changes: Partial<GameState>): GameState {
  return { ...state, ...changes };
}

export function patchPlayer(
  state: GameState,
  id: string,
  changes: Partial<PlayerState>,
): GameState {
  return {
    ...state,
    players: state.players.map((p) => (p.id === id ? { ...p, ...changes } : p)),
  };
}

export function player(state: GameState, id: string): PlayerState {
  const found = state.players.find((p) => p.id === id);
  if (!found) throw new Error(`no player ${id}`);
  return found;
}

export function act(state: GameState, action: Action): { state: GameState; events: GameEvent[] } {
  const result = applyAction(state, action);
  if (!result.ok) throw new Error(`${action.type} by ${action.playerId} failed: ${result.error}`);
  return { state: result.state, events: [...result.events] };
}

export function actAll(
  state: GameState,
  actions: Action[],
): { state: GameState; events: GameEvent[] } {
  const events: GameEvent[] = [];
  for (const action of actions) {
    const r = act(state, action);
    state = r.state;
    events.push(...r.events);
  }
  return { state, events };
}

export function expectError(state: GameState, action: Action, error: ErrorKey): void {
  const result = applyAction(state, action);
  expect(result.ok ? 'ok' : result.error).toBe(error);
}

/** Everyone bids in seat order; values keyed by player id. */
export function bidAll(state: GameState, bids: Record<string, number>) {
  return actAll(
    state,
    state.players.map((p): Action => ({ type: 'bid', playerId: p.id, value: bids[p.id]! })),
  );
}

/** Everyone takes the first stall card in pick order until the stall phase ends. */
export function pickAll(state: GameState) {
  const events: GameEvent[] = [];
  while (state.phase === 'pick' && !state.powerWindow) {
    const r = act(state, {
      type: 'pick',
      playerId: state.pickQueue[0]!,
      cardId: state.market[0]!.id,
    });
    state = r.state;
    events.push(...r.events);
  }
  return { state, events };
}

/**
 * Reach Trash Dig with a clean table: everyone bids the same number (all clash), picks,
 * then every hand and the discard pile are emptied so tests control what is held.
 */
export function skipToTrash(state: GameState, value = 1) {
  const bid = bidAll(state, Object.fromEntries(state.players.map((p) => [p.id, value])));
  const picked = pickAll(bid.state);
  const clean = patch(picked.state, {
    discard: [],
    players: picked.state.players.map((p) => ({ ...p, hand: [] })),
  });
  return { state: clean, events: [...bid.events, ...picked.events] };
}

/** Everyone stops digging at once (bags empty). */
export function stopAll(state: GameState) {
  const events: GameEvent[] = [];
  while (state.phase === 'trash') {
    const r = act(state, { type: 'stop', playerId: state.turnOrder[state.turnIndex]! });
    state = r.state;
    events.push(...r.events);
  }
  return { state, events };
}

/**
 * Feast Time with the given hands (others empty). Players with nothing to eat are
 * skipped automatically, so the returned state waits on the first player who can eat.
 */
export function skipToEat(state: GameState, hands: Record<string, Card[]> = {}) {
  let s = skipToTrash(state).state;
  s = patch(s, { players: s.players.map((p) => ({ ...p, hand: hands[p.id] ?? [] })) });
  return stopAll(s).state;
}

/** Current eater finishes until Feast Time is over. */
export function finishFeast(state: GameState) {
  const events: GameEvent[] = [];
  while (state.phase === 'eat') {
    const r = act(state, { type: 'finishEating', playerId: state.turnOrder[state.turnIndex]! });
    state = r.state;
    events.push(...r.events);
  }
  return { state, events };
}

export function eventTypes(events: readonly GameEvent[]): string[] {
  return events.map((e) => e.type);
}

/** All card ids anywhere in the game (for conservation checks). */
export function allCardIds(s: GameState): number[] {
  return [
    ...s.marketDeck,
    ...s.market,
    ...s.trashDeck,
    ...s.discard,
    ...s.bag,
    ...(s.pendingDog ? [s.pendingDog] : []),
    ...s.setAsideDogs,
    ...s.players.flatMap((p) => [...p.hand, ...p.meals.flatMap((m) => m.cards)]),
  ].map((c) => c.id);
}

/** Ids of every card object reachable in a value (e.g. a PlayerView), wherever it sits. */
export function reachableCardIds(value: unknown, out = new Set<number>()): Set<number> {
  if (Array.isArray(value)) {
    for (const item of value) reachableCardIds(item, out);
  } else if (value !== null && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    if (typeof obj.id === 'number' && typeof obj.kind === 'string') out.add(obj.id);
    for (const child of Object.values(obj)) reachableCardIds(child, out);
  }
  return out;
}

/**
 * Plays a whole game with random legal moves chosen from each player's own view.
 * `onStep` sees every intermediate state. Returns the action log for replay tests.
 */
export function playRandomGame(
  seed: number | string,
  players = 3,
  onStep?: (state: GameState, action: Action, events: readonly GameEvent[]) => void,
  config?: GameConfig,
  cats?: Readonly<Record<string, CatId>>,
  events = false,
): { final: GameState; actions: Action[] } {
  let state = createGame({
    playerIds: P.slice(0, players),
    seed,
    ...(config ? { config } : {}),
    ...(cats ? { cats } : {}),
    events,
  });
  const botRng = createRng(`bots:${String(seed)}`);
  const actions: Action[] = [];
  for (let step = 0; state.phase !== 'gameOver'; step++) {
    if (step > 5000) throw new Error(`game ${String(seed)} did not finish`);
    const actors = pendingActors(state);
    const actor = actors[botRng.int(actors.length)]!;
    const action = chooseRandomAction(getPlayerView(state, actor), botRng);
    if (!action) throw new Error(`no action for ${actor} in ${state.phase}`);
    const result = applyAction(state, action);
    if (!result.ok) throw new Error(`${action.type} by ${actor} → ${result.error}`);
    state = result.state;
    actions.push(action);
    onStep?.(state, action, result.events);
  }
  return { final: state, actions };
}
