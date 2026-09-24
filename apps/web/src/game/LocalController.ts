import {
  type Action,
  applyAction,
  chooseBotAction,
  createGame,
  createRng,
  type ErrorKey,
  type GameEvent,
  type GameState,
  getPlayerView,
  pendingActors,
  type PlayerId,
  type Rng,
} from '@meow/engine';
import { clearSave, type SaveStorage, type SoloSave, writeSave } from './save';
import type { ControllerSnapshot, GameController, SeatInfo } from './types';

/** Timers are injectable so tests can run a whole game instantly. */
export interface Scheduler {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
  /** Only used for bot "thinking" delays — never for game logic. */
  random(): number;
}

export const browserScheduler: Scheduler = {
  setTimeout: (fn, ms) => window.setTimeout(fn, ms),
  clearTimeout: (handle) => window.clearTimeout(handle as number),
  random: () => Math.random(),
};

/** GAME_RULES §9: bots wait 600–1200 ms so they feel natural. */
export const BOT_DELAY_MS = { min: 600, max: 1200 } as const;
/** A forced move (e.g. the last meow card) is played for the human after this pause. */
const AUTO_MOVE_MS = 700;
const RECENT_EVENTS = 40;

export interface LocalControllerOptions {
  readonly state: GameState;
  readonly seats: readonly SeatInfo[];
  readonly viewerId: PlayerId;
  readonly botRng: number;
  readonly storage: SaveStorage | null;
  readonly scheduler: Scheduler;
}

/**
 * Runs the engine in the browser for solo play (and later pass-and-play), drives the bots
 * and saves after every change. The UI only ever sees `getPlayerView` for the human seat.
 */
export class LocalController implements GameController {
  private state: GameState;
  private readonly seats: readonly SeatInfo[];
  private readonly viewerId: PlayerId;
  private readonly botRng: Rng;
  private readonly storage: SaveStorage | null;
  private readonly scheduler: Scheduler;
  private readonly timers = new Map<PlayerId, unknown>();
  private readonly listeners = new Set<() => void>();
  private recentEvents: GameEvent[] = [];
  private snapshot: ControllerSnapshot;
  private version = 0;
  private eventCount = 0;
  private disposed = false;
  private paused = false;

  constructor(options: LocalControllerOptions) {
    this.state = options.state;
    this.seats = options.seats;
    this.viewerId = options.viewerId;
    this.botRng = createRng(options.botRng);
    this.storage = options.storage;
    this.scheduler = options.scheduler;
    this.snapshot = this.buildSnapshot();
    this.save();
    this.scheduleMoves();
  }

  static newSolo(
    seats: readonly SeatInfo[],
    seed: number | string,
    storage: SaveStorage | null,
    scheduler: Scheduler,
  ): LocalController {
    const state = createGame({ playerIds: seats.map((s) => s.id), seed });
    const human = seats.find((s) => !s.bot);
    if (!human) throw new Error('solo game needs one human seat');
    return new LocalController({
      state,
      seats,
      viewerId: human.id,
      botRng: createRng(`bots:${String(seed)}`).state,
      storage,
      scheduler,
    });
  }

  static fromSave(save: SoloSave, storage: SaveStorage | null, scheduler: Scheduler) {
    return new LocalController({ ...save, storage, scheduler });
  }

  getSnapshot = (): ControllerSnapshot => this.snapshot;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  dispatch = (action: Action): ErrorKey | null => {
    if (this.disposed) return null;
    const result = applyAction(this.state, action);
    if (!result.ok) return result.error;
    this.state = result.state;
    this.recentEvents = [...this.recentEvents, ...result.events].slice(-RECENT_EVENTS);
    this.eventCount += result.events.length;
    this.version++;
    this.snapshot = this.buildSnapshot();
    this.save();
    for (const listener of this.listeners) listener();
    this.scheduleMoves();
    return null;
  };

  setPaused = (paused: boolean): void => {
    if (this.paused === paused) return;
    this.paused = paused;
    if (paused) {
      // Drop pending bot moves; they get a fresh "thinking" delay after the pause.
      for (const handle of this.timers.values()) this.scheduler.clearTimeout(handle);
      this.timers.clear();
    } else {
      this.scheduleMoves();
    }
  };

  dispose = (): void => {
    this.disposed = true;
    for (const handle of this.timers.values()) this.scheduler.clearTimeout(handle);
    this.timers.clear();
    this.listeners.clear();
  };

  /** Current engine state — for tests and debugging only; the UI uses the snapshot. */
  get debugState(): GameState {
    return this.state;
  }

  private buildSnapshot(): ControllerSnapshot {
    return {
      view: getPlayerView(this.state, this.viewerId),
      seats: this.seats,
      recentEvents: this.recentEvents,
      eventCount: this.eventCount,
      version: this.version,
    };
  }

  private save(): void {
    if (this.state.phase === 'gameOver') {
      clearSave(this.storage);
      return;
    }
    writeSave(this.storage, {
      v: 1,
      state: this.state,
      seats: this.seats,
      viewerId: this.viewerId,
      botRng: this.botRng.state,
    });
  }

  /** Give every bot the game is waiting on a turn after a short "thinking" pause. */
  private scheduleMoves(): void {
    if (this.disposed || this.paused) return;
    const waiting = pendingActors(this.state);
    for (const id of waiting) {
      if (this.timers.has(id)) continue;
      const seat = this.seats.find((s) => s.id === id);
      if (seat?.bot) {
        const { min, max } = BOT_DELAY_MS;
        this.timers.set(
          id,
          this.scheduler.setTimeout(
            () => this.playBot(id),
            min + this.scheduler.random() * (max - min),
          ),
        );
      } else if (id === this.viewerId) {
        this.scheduleForcedHumanMove(id);
      }
    }
  }

  /** The last meow card is the only legal bid — play it for the player. */
  private scheduleForcedHumanMove(id: PlayerId): void {
    const me = this.state.players.find((p) => p.id === id);
    if (this.state.phase !== 'bidding' || !me || me.meowLeft.length !== 1) return;
    const value = me.meowLeft[0]!;
    this.timers.set(
      id,
      this.scheduler.setTimeout(() => {
        this.timers.delete(id);
        this.dispatch({ type: 'bid', playerId: id, value });
      }, AUTO_MOVE_MS),
    );
  }

  private playBot(id: PlayerId): void {
    this.timers.delete(id);
    if (this.disposed || this.paused || !pendingActors(this.state).includes(id)) return;
    const seat = this.seats.find((s) => s.id === id);
    if (!seat?.bot) return;
    const view = getPlayerView(this.state, id);
    const action = chooseBotAction(seat.bot.personality, seat.bot.difficulty, view, this.botRng);
    if (action) this.dispatch(action);
    else this.scheduleMoves();
  }
}
