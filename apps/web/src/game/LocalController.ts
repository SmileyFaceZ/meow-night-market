import { SPEED_FACTOR } from '@meow/protocol';
import { speedStore } from './speed';
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
  type PlayerView,
  type Rng,
} from '@meow/engine';
import { CLASSIC_MODE, type GameMode } from '@meow/protocol';
import { type Handoff, isForcedBid, isSecretPhase, nextHandoff } from './handoff';
import { clearSave, type GameSave, type SaveStorage, writeSave } from './save';
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
  /** The human whose view is on screen (with several humans: whoever holds the device). */
  readonly viewerId: PlayerId;
  readonly botRng: number;
  readonly storage: SaveStorage | null;
  readonly scheduler: Scheduler;
  /** Scripted bot moves (tutorial). Return null to let the bot decide as usual. */
  readonly botOverride?: ((view: PlayerView) => Action | null) | undefined;
}

/**
 * Runs the engine in the browser for solo play and pass-and-play, drives the bots and
 * saves after every change. The UI only ever sees `getPlayerView` for one human seat;
 * with several humans that seat changes hands through a handoff cover (./handoff.ts).
 */
export class LocalController implements GameController {
  private state: GameState;
  private readonly seats: readonly SeatInfo[];
  private viewerId: PlayerId;
  private readonly sharedDevice: boolean;
  private handoff: Handoff | null;
  private readonly botRng: Rng;
  private readonly storage: SaveStorage | null;
  private readonly scheduler: Scheduler;
  private readonly botOverride: ((view: PlayerView) => Action | null) | undefined;
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
    this.sharedDevice = options.seats.filter((s) => !s.bot).length > 1;
    // A shared game (new or resumed) always opens behind the cover, so the right player
    // is holding the device before anything is shown.
    this.handoff = this.sharedDevice
      ? (nextHandoff(this.state, this.seats, this.viewerId) ?? {
          to: this.viewerId,
          secret: isSecretPhase(this.state.phase),
        })
      : null;
    this.botRng = createRng(options.botRng);
    this.storage = options.storage;
    this.scheduler = options.scheduler;
    this.botOverride = options.botOverride;
    this.snapshot = this.buildSnapshot();
    this.save();
    this.scheduleMoves();
  }

  /** A new solo (one human) or pass-and-play (several humans) game. */
  static newGame(
    seats: readonly SeatInfo[],
    seed: number | string,
    storage: SaveStorage | null,
    scheduler: Scheduler,
    mode: GameMode = CLASSIC_MODE,
  ): LocalController {
    const state = createGame({
      playerIds: seats.map((s) => s.id),
      seed,
      // With cat powers, each seat's cat is its power (GAME_RULES §14).
      ...(mode.powers ? { cats: Object.fromEntries(seats.map((s) => [s.id, s.cat])) } : {}),
      events: mode.events,
    });
    const human = seats.find((s) => !s.bot);
    if (!human) throw new Error('a local game needs a human seat');
    return new LocalController({
      state,
      seats,
      viewerId: human.id,
      botRng: createRng(`bots:${String(seed)}`).state,
      storage,
      scheduler,
    });
  }

  static fromSave(save: GameSave, storage: SaveStorage | null, scheduler: Scheduler) {
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
    if (this.sharedDevice) this.handoff = nextHandoff(this.state, this.seats, this.viewerId);
    this.snapshot = this.buildSnapshot();
    this.save();
    this.emit();
    this.scheduleMoves();
    return null;
  };

  acceptHandoff = (): void => {
    if (this.disposed || !this.handoff) return;
    this.viewerId = this.handoff.to;
    this.handoff = null;
    this.version++;
    this.snapshot = this.buildSnapshot();
    this.save();
    this.emit();
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
      sharedDevice: this.sharedDevice,
      handoff: this.handoff,
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

  private emit(): void {
    for (const listener of this.listeners) listener();
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
        const factor = SPEED_FACTOR[speedStore.get()];
        this.timers.set(
          id,
          this.scheduler.setTimeout(
            () => this.playBot(id),
            (min + this.scheduler.random() * (max - min)) * factor,
          ),
        );
      } else if (seat) {
        this.scheduleForcedHumanMove(id);
      }
    }
  }

  /** The last meow card is the only legal bid — play it for the player (every human seat). */
  private scheduleForcedHumanMove(id: PlayerId): void {
    if (!isForcedBid(this.state, id)) return;
    const value = this.state.players.find((p) => p.id === id)!.meowLeft[0]!;
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
    const action =
      this.botOverride?.(view) ??
      chooseBotAction(seat.bot.personality, seat.bot.difficulty, view, this.botRng);
    if (action) this.dispatch(action);
    else this.scheduleMoves();
  }
}
