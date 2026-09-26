import type { Action, PlayerId } from '@meow/engine';
import {
  type ClientMessage,
  type EmoteId,
  parseMessage,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  type RoomInfo,
  type ServerMessage,
  serverMessageSchema,
  DEFAULT_SPEED,
} from '@meow/protocol';
import type { Scheduler } from './LocalController';
import type {
  CatColor,
  ControllerSnapshot,
  GameController,
  OnlineExtras,
  Presence,
  SeatInfo,
  ShownEmote,
} from './types';

// Online play (docs/MULTIPLAYER.md): the server owns the game; this controller only shows
// what it sends (`getPlayerView` for our seat) and sends our moves. Same GameController
// interface as local play, so the game screen does not care where the game runs.

export type Connection = 'connecting' | 'open' | 'reconnecting';
/** Reasons the room cannot be used at all (no point reconnecting). */
export type RoomProblem = 'notFound' | 'full';

export interface OnlineState {
  readonly code: string;
  readonly connection: Connection;
  readonly problem: RoomProblem | null;
  readonly room: RoomInfo | null;
  /** The game, once it has started (null in the lobby). */
  readonly game: ControllerSnapshot | null;
  /** The latest refusal from the server, as an i18n key (id changes each time). */
  readonly notice: { readonly id: number; readonly key: string } | null;
}

export interface Profile {
  readonly name: string;
  readonly cat: CatColor;
}

/** The parts of WebSocket we use (tests pass a fake). */
export interface SocketLike {
  send(data: string): void;
  close(code?: number, reason?: string): void;
  onopen: (() => void) | null;
  onmessage: ((event: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
}

export interface RemoteOptions {
  readonly code: string;
  readonly profile: Profile;
  /** The site's own origin (the Worker serves both the page and /api). */
  readonly origin: string;
  readonly connect: (url: string) => SocketLike;
  readonly scheduler: Scheduler;
  /** Where the reconnect token lives (sessionStorage in the browser). */
  readonly tokens: TokenStore | null;
}

export interface TokenStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

const RECENT_EVENTS = 40;
const RETRY_MS = [500, 1000, 2000, 4000, 8000] as const;
/** Keeps the connection alive; the server answers without waking the room. */
const PING_EVERY_MS = 30_000;
const PING = JSON.stringify({ type: 'ping' });
/** How long a sticker stays on screen. */
export const EMOTE_SHOW_MS = 3_000;

export class RemoteController implements GameController {
  private readonly options: RemoteOptions;
  private readonly listeners = new Set<() => void>();
  private socket: SocketLike | null = null;
  private retries = 0;
  private retryTimer: unknown = null;
  private pingTimer: unknown = null;
  private disposed = false;
  private state: OnlineState;
  private seatId: PlayerId | null = null;
  private extras: OnlineExtras;
  private noticeId = 0;
  private emoteId = 0;
  /** The room's game the current snapshot belongs to (a rematch starts over). */
  private viewGameNo = -1;

  constructor(options: RemoteOptions) {
    this.options = options;
    this.state = {
      code: options.code,
      connection: 'connecting',
      problem: null,
      room: null,
      game: null,
      notice: null,
    };
    this.extras = {
      clocks: [],
      emotes: [],
      presence: {},
      spectating: false,
      speed: DEFAULT_SPEED,
      openAt: 0,
    };
    this.open();
  }

  getOnline = (): OnlineState => this.state;

  /** The game as the game screen sees it — only valid once the game has started. */
  getSnapshot = (): ControllerSnapshot => {
    if (!this.state.game) throw new Error('the online game has not started');
    return this.state.game;
  };

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  dispatch = (action: Action): string | null => {
    if (this.seatId === null || action.playerId !== this.seatId) return 'room.error.notSeated';
    this.send({ type: 'action', action });
    return null; // refusals arrive later as a notice
  };

  /** The server paces the game (it waits for the screen), so there is nothing to pause. */
  setPaused = (): void => {};

  emote = (id: EmoteId): void => this.send({ type: 'emote', id });

  send = (message: ClientMessage): void => {
    if (this.state.connection !== 'open') return;
    this.socket?.send(JSON.stringify(message));
  };

  /** Give up the seat and close. */
  leave = (): void => {
    this.send({ type: 'leave' });
    this.dispose();
  };

  dispose = (): void => {
    this.disposed = true;
    const { scheduler } = this.options;
    if (this.retryTimer !== null) scheduler.clearTimeout(this.retryTimer);
    if (this.pingTimer !== null) scheduler.clearTimeout(this.pingTimer);
    const socket = this.socket;
    this.socket = null;
    socket?.close(1000, 'bye');
    this.listeners.clear();
  };

  // ------------------------------------------------------------ connection

  private get tokenKey(): string {
    return tokenKey(this.options.code);
  }

  private open(): void {
    const { origin, code, connect } = this.options;
    const url = `${origin.replace(/^http/, 'ws')}/api/rooms/${code}/ws`;
    const socket = connect(url);
    this.socket = socket;
    socket.onopen = () => {
      if (socket !== this.socket) return;
      this.retries = 0;
      this.update({ connection: 'open' });
      const token = this.readToken();
      this.send({
        type: 'hello',
        name: this.options.profile.name,
        cat: this.options.profile.cat,
        ...(token ? { token } : {}),
      });
      this.schedulePing();
    };
    socket.onmessage = (event) => {
      if (socket !== this.socket) return;
      const message = parseMessage(serverMessageSchema, event.data);
      if (message) this.receive(message);
    };
    socket.onclose = () => {
      if (socket !== this.socket || this.disposed) return;
      this.socket = null;
      if (this.state.problem) return;
      this.update({ connection: 'reconnecting' });
      const delay = RETRY_MS[Math.min(this.retries++, RETRY_MS.length - 1)] ?? 8000;
      this.retryTimer = this.options.scheduler.setTimeout(() => {
        this.retryTimer = null;
        if (!this.disposed) this.open();
      }, delay);
    };
  }

  private schedulePing(): void {
    const { scheduler } = this.options;
    if (this.pingTimer !== null) scheduler.clearTimeout(this.pingTimer);
    this.pingTimer = scheduler.setTimeout(() => {
      this.pingTimer = null;
      if (this.disposed || !this.socket) return;
      if (this.state.connection === 'open') this.socket.send(PING);
      this.schedulePing();
    }, PING_EVERY_MS);
  }

  private readToken(): string | null {
    try {
      return this.options.tokens?.getItem(this.tokenKey) ?? null;
    } catch {
      return null;
    }
  }

  private storeToken(token: string): void {
    try {
      this.options.tokens?.setItem(this.tokenKey, token);
    } catch {
      // no storage: a refresh will just join as someone new
    }
  }

  // ------------------------------------------------------------ messages

  private receive(message: ServerMessage): void {
    switch (message.type) {
      case 'welcome':
        this.seatId = message.seatId;
        if (message.seatId !== null) this.storeToken(message.token);
        if (message.seatId === null) this.setExtras({ spectating: true });
        return;
      case 'room': {
        const presence: Record<PlayerId, Presence> = {};
        for (const seat of message.room.seats) {
          if (seat.standIn) presence[seat.id] = 'standIn';
          else if (!seat.connected) presence[seat.id] = 'away';
        }
        // Watching: no seat, or sitting this game out (GAME_RULES §13).
        const mine = message.room.seats.find((s) => s.id === message.room.you);
        const spectating = !mine || mine.sittingOut !== null;
        const speed = message.room.speed ?? DEFAULT_SPEED;
        this.extras = { ...this.extras, presence, spectating, speed };
        this.update({ room: message.room, game: this.withExtras(message.room) });
        return;
      }
      case 'view': {
        const now = Date.now();
        const clocks = message.clocks.map((c) => ({
          playerId: c.playerId,
          deadline: c.remainingMs === null ? null : now + c.remainingMs,
        }));
        this.extras = { ...this.extras, clocks, openAt: now + (message.openInMs ?? 0) };
        // A rematch: the new game's history starts empty (its screen opens with the banner).
        const gameNo = this.state.room?.gameNo ?? 0;
        const previous = gameNo === this.viewGameNo ? this.state.game : null;
        this.viewGameNo = gameNo;
        const recentEvents = [...(previous?.recentEvents ?? []), ...message.events].slice(
          -RECENT_EVENTS,
        );
        const game: ControllerSnapshot = {
          view: message.view,
          seats: this.gameSeats(previous),
          recentEvents,
          eventCount: (previous?.eventCount ?? 0) + message.events.length,
          version: (previous?.version ?? 0) + 1,
          sharedDevice: false,
          handoff: null,
          online: this.extras,
        };
        this.update({ game });
        return;
      }
      case 'emote': {
        const shown: ShownEmote = { key: ++this.emoteId, from: message.from, id: message.id };
        this.setExtras({ emotes: [...this.extras.emotes, shown].slice(-4) });
        this.options.scheduler.setTimeout(() => {
          if (this.disposed) return;
          this.setExtras({ emotes: this.extras.emotes.filter((e) => e.key !== shown.key) });
        }, EMOTE_SHOW_MS);
        return;
      }
      case 'error':
        if (message.key === 'room.error.notFound' || message.key === 'room.error.full') {
          this.update({ problem: message.key === 'room.error.full' ? 'full' : 'notFound' });
        }
        this.update({ notice: { id: ++this.noticeId, key: message.key } });
        return;
      case 'pong':
        return;
    }
  }

  /** A game snapshot with fresh seats/extras (same view), or null before the game. */
  private withExtras(room: RoomInfo | null): ControllerSnapshot | null {
    const game = this.state.game;
    if (!game || room?.status === 'lobby') return null;
    return {
      ...game,
      seats: this.gameSeats(game),
      version: game.version + 1,
      online: this.extras,
    };
  }

  /**
   * Seats of the current room, plus anyone who played this game and has since left
   * (the result still names them).
   */
  private gameSeats(game: ControllerSnapshot | null): SeatInfo[] {
    const now = seatsOf(this.state.room);
    const gone = (game?.seats ?? []).filter((old) => !now.some((s) => s.id === old.id));
    return [...now, ...gone];
  }

  private setExtras(patch: Partial<OnlineExtras>): void {
    this.extras = { ...this.extras, ...patch };
    this.update({ game: this.withExtras(this.state.room) });
  }

  private update(patch: Partial<OnlineState>): void {
    this.state = { ...this.state, ...patch };
    for (const listener of this.listeners) listener();
  }
}

function seatsOf(room: RoomInfo | null): SeatInfo[] {
  return (room?.seats ?? []).map((s) => ({ id: s.id, name: s.name, cat: s.cat, bot: s.bot }));
}

/**
 * Asks the server for a new room; resolves to its code. The API is always on this same
 * origin — in development Vite forwards /api to `wrangler dev` (vite.config.ts).
 */
export async function createRoom(): Promise<string> {
  const response = await fetch('/api/rooms', { method: 'POST' });
  if (!response.ok) throw new Error(`create room: ${response.status}`);
  const { code } = (await response.json()) as { code: string };
  return code;
}

export function browserSocket(url: string): SocketLike {
  return new WebSocket(url) as unknown as SocketLike;
}

const tokenKey = (code: string) => `mnm.room.${code}`;

/** This tab already holds a seat in that room (it was refreshed or reopened). */
export function hasSeatToken(code: string, tokens = sessionTokens()): boolean {
  try {
    return Boolean(tokens?.getItem(tokenKey(code)));
  } catch {
    return false;
  }
}

export function sessionTokens(): TokenStore | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

/** Keep only letters a room code can have, upper-cased. */
export function cleanCode(text: string): string {
  return [...text.toUpperCase()]
    .filter((c) => ROOM_CODE_ALPHABET.includes(c))
    .join('')
    .slice(0, ROOM_CODE_LENGTH);
}
