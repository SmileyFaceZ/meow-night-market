import {
  type Action,
  applyAction,
  chooseBotAction,
  createGame,
  createRng,
  type GameEvent,
  type GameState,
  getPlayerView,
  pendingActors,
  type PlayerId,
  upgradeState,
} from '@meow/engine';
import {
  AUTO_MOVE_MS,
  BEAT_MS,
  BOT_DELAY_MS,
  type CatColor,
  type ClientMessage,
  clientMessageSchema,
  DEFAULT_TURN_SECONDS,
  DISCONNECT_GRACE_MS,
  EMOTE_COOLDOWN_MS,
  EMPTY_ROOM_TTL_MS,
  MAX_MESSAGE_BYTES,
  MAX_SEATS,
  MAX_SPECTATORS,
  MIN_SEATS_TO_START,
  parseMessage,
  RATE_LIMIT,
  RESULT_IDLE_MS,
  type RoomBot,
  type RoomErrorKey,
  type RoomInfo,
  type RoomStatus,
  type ServerMessage,
  showTimeMs,
  type SittingOut,
  STAND_IN_BOT,
  type TurnClock,
  type TurnSeconds,
} from '@meow/protocol';

// One online room (docs/MULTIPLAYER.md). Pure logic: the Durable Object (room.ts) supplies
// connections, the clock, randomness and storage, so all of this runs in plain unit tests.

export interface StoredSeat {
  readonly id: PlayerId;
  readonly name: string | null;
  readonly cat: CatColor;
  readonly bot: RoomBot | null;
  /** Humans only: proves "this seat is mine" when reconnecting. */
  readonly token: string | null;
  readonly host: boolean;
  /** Humans: null while connected, else when they were last seen. */
  readonly awaySince: number | null;
  /** A bot plays for this human (dropped out for too long, or left). */
  readonly standIn: boolean;
  /** Ran out of time: a bot finishes this turn for them. */
  readonly timedOut: boolean;
  /** After a game: this human wants to play again (bots always do). */
  readonly ready: boolean;
  /** Games won in this room — belongs to the person, so it survives sitting a game out. */
  readonly wins: number;
  /** Not in the current game (was not ready when it started). */
  readonly sittingOut: SittingOut | null;
}

export interface StoredRoom {
  readonly v: 1;
  readonly code: string;
  readonly status: RoomStatus;
  readonly seats: readonly StoredSeat[];
  readonly turnSeconds: TurnSeconds;
  readonly nextSeatNo: number;
  readonly game: GameState | null;
  readonly botRng: number;
  /** When clients will have finished showing the latest events (bots wait until then). */
  readonly showUntil: number;
  /** When each player the game waits on got the turn (their timer counts from here). */
  readonly turnStart: Readonly<Record<PlayerId, number>>;
  /** When each automatic mover (bot, stand-in, forced bid) will play. */
  readonly due: Readonly<Record<PlayerId, number>>;
  /** Nobody connected since then (the room is deleted after EMPTY_ROOM_TTL_MS). */
  readonly emptySince: number | null;
  /** Games started so far. */
  readonly gameNo: number;
  /** After a game: last time anyone did something (RESULT_IDLE_MS counts from here). */
  readonly idleSince: number | null;
}

/** A client connection as the room sees it; the Durable Object keeps `seatId` across hibernation. */
export interface Conn {
  readonly id: string;
  /** Null until hello; then a seat id, or '' (SPECTATOR) when watching. */
  seatId: string | null;
  send(message: ServerMessage): void;
  close(code: number, reason: string): void;
}

export interface RoomDeps {
  now(): number;
  /** [0, 1) — only for bot thinking time and game seeds, never inside the engine. */
  random(): number;
  /** A fresh reconnect token. */
  token(): string;
  /** Every open connection. */
  conns(): readonly Conn[];
}

const SPECTATOR = '';

export function newRoom(code: string, now: number): StoredRoom {
  return {
    v: 1,
    code,
    status: 'lobby',
    seats: [],
    turnSeconds: DEFAULT_TURN_SECONDS,
    nextSeatNo: 0,
    game: null,
    botRng: 0,
    showUntil: now,
    turnStart: {},
    due: {},
    emptySince: now,
    gameNo: 0,
    idleSince: null,
  };
}

/**
 * A room saved before a deploy may lack fields added since (rematch, cat powers, events):
 * fill them in so it carries on.
 */
export function upgradeRoom(room: StoredRoom): StoredRoom {
  return {
    ...room,
    gameNo: room.gameNo ?? (room.game ? 1 : 0),
    idleSince: room.idleSince ?? null,
    seats: room.seats.map((s) => ({
      ...s,
      ready: s.ready ?? false,
      wins: s.wins ?? 0,
      sittingOut: s.sittingOut ?? null,
    })),
    game: room.game ? upgradeState(room.game) : null,
  };
}

/** Between games the room works like a lobby: seats, bots and settings can change. */
function betweenGames(status: RoomStatus): boolean {
  return status === 'lobby' || status === 'ended';
}

export class RoomCore {
  private room: StoredRoom;
  private readonly deps: RoomDeps;
  /** Spam guard per connection (memory only — a hibernating room has no traffic anyway). */
  private readonly rates = new Map<string, { start: number; count: number }>();
  private readonly lastEmote = new Map<PlayerId, number>();
  private changed = false;

  constructor(room: StoredRoom, deps: RoomDeps) {
    this.room = upgradeRoom(room);
    this.deps = deps;
  }

  get state(): StoredRoom {
    return this.room;
  }

  /** True once since the last call if the room must be saved. */
  takeChanged(): boolean {
    const changed = this.changed;
    this.changed = false;
    return changed;
  }

  /** The room is empty for good: storage can be wiped. */
  get expired(): boolean {
    const { emptySince } = this.room;
    return emptySince !== null && this.deps.now() - emptySince >= EMPTY_ROOM_TTL_MS;
  }

  // ---------------------------------------------------------------- connections

  handleOpen(): void {
    if (this.room.emptySince !== null) this.update({ emptySince: null });
  }

  handleMessage(conn: Conn, raw: unknown): void {
    if (typeof raw !== 'string' || raw.length > MAX_MESSAGE_BYTES) {
      return this.fail(conn, 'room.error.badMessage');
    }
    if (!this.withinRate(conn)) return this.fail(conn, 'room.error.tooFast');
    const message = parseMessage(clientMessageSchema, raw);
    if (!message) return this.fail(conn, 'room.error.badMessage');
    if (message.type === 'ping') return conn.send({ type: 'pong' });
    if (message.type === 'hello') return this.hello(conn, message);
    if (conn.seatId === null) return this.fail(conn, 'room.error.notSeated');
    this.handle(conn, message);
    this.runClock();
  }

  handleClose(conn: Conn): void {
    this.rates.delete(conn.id);
    const seat = this.seatOf(conn);
    const others = this.deps.conns().filter((c) => c.id !== conn.id);
    if (seat && !others.some((c) => c.seatId === seat.id)) {
      this.setSeat(seat.id, { awaySince: this.deps.now() });
      if (seat.host) this.passHost(seat.id, others);
    }
    if (others.length === 0) this.update({ emptySince: this.deps.now() });
    this.runClock();
    this.broadcastRoom(others);
  }

  /** Alarm: timers ran out, bots are due, someone stayed away too long… */
  handleAlarm(): void {
    this.runClock();
  }

  /** When the Durable Object should wake next (null = nothing scheduled). */
  nextWake(): number | null {
    const times: number[] = [];
    const { room } = this;
    if (room.emptySince !== null) times.push(room.emptySince + EMPTY_ROOM_TTL_MS);
    else if (room.status === 'ended' && room.idleSince !== null) {
      times.push(room.idleSince + RESULT_IDLE_MS);
    }
    for (const seat of room.seats) {
      if (seat.awaySince !== null && !seat.standIn)
        times.push(seat.awaySince + DISCONNECT_GRACE_MS);
    }
    if (room.game && room.status === 'playing') {
      times.push(...Object.values(room.due));
      for (const id of this.waitingHumans()) {
        const deadline = this.deadlineOf(id);
        if (deadline !== null) times.push(deadline);
      }
    }
    return times.length > 0 ? Math.min(...times) : null;
  }

  // ---------------------------------------------------------------- messages

  private hello(conn: Conn, message: Extract<ClientMessage, { type: 'hello' }>): void {
    const { room } = this;
    const name = message.name.trim() || null;
    const mine = message.token ? room.seats.find((s) => s.token === message.token) : undefined;

    if (mine) {
      // Coming back: same seat, the stand-in bot steps aside.
      conn.seatId = mine.id;
      this.setSeat(mine.id, { awaySince: null, standIn: false, timedOut: false });
      if (betweenGames(room.status)) this.setSeat(mine.id, { name, cat: message.cat });
      const hostHere = this.room.seats.some((s) => s.host && s.awaySince === null && !s.bot);
      if (!hostHere) this.makeHost(mine.id);
      conn.send({ type: 'welcome', token: mine.token!, seatId: mine.id });
    } else if (betweenGames(room.status) && room.seats.length < MAX_SEATS) {
      const token = this.deps.token();
      const id = `p${room.nextSeatNo}`;
      const host = !room.seats.some((s) => s.host);
      this.update({
        nextSeatNo: room.nextSeatNo + 1,
        seats: [
          ...room.seats,
          {
            id,
            name,
            cat: message.cat,
            bot: null,
            token,
            host,
            awaySince: null,
            standIn: false,
            timedOut: false,
            ready: false,
            wins: 0,
            sittingOut: null,
          },
        ],
      });
      conn.seatId = id;
      conn.send({ type: 'welcome', token, seatId: id });
    } else {
      const watching = this.deps.conns().filter((c) => c.seatId === SPECTATOR && c.id !== conn.id);
      if (watching.length + this.seatsWatching() >= MAX_SPECTATORS) {
        this.fail(conn, 'room.error.full');
        conn.close(4003, 'full');
        return;
      }
      conn.seatId = SPECTATOR;
      conn.send({ type: 'welcome', token: message.token ?? this.deps.token(), seatId: null });
    }
    this.runClock();
    this.broadcastRoom();
    if (this.room.game) this.sendView(conn, []);
  }

  private handle(conn: Conn, message: Exclude<ClientMessage, { type: 'hello' | 'ping' }>): void {
    const seat = this.seatOf(conn);
    switch (message.type) {
      case 'action':
        if (!seat || message.action.playerId !== seat.id || !this.inGame(seat.id))
          return this.fail(conn, 'room.error.notSeated');
        if (this.room.status !== 'playing') return this.fail(conn, 'error.gameOver');
        // Acting again means they are back in time: the stand-in stops for this turn.
        if (seat.timedOut) this.setSeat(seat.id, { timedOut: false });
        this.play(message.action, conn);
        return;
      case 'emote': {
        if (!seat || seat.sittingOut) return this.fail(conn, 'room.error.notSeated');
        const now = this.deps.now();
        if (now - (this.lastEmote.get(seat.id) ?? -Infinity) < EMOTE_COOLDOWN_MS) return;
        this.lastEmote.set(seat.id, now);
        return this.broadcast({ type: 'emote', from: seat.id, id: message.id });
      }
      case 'updateMe':
        if (!seat || !betweenGames(this.room.status))
          return this.fail(conn, 'room.error.alreadyStarted');
        this.setSeat(seat.id, { name: message.name.trim() || null, cat: message.cat });
        this.touch();
        return this.broadcastRoom();
      case 'ready':
        if (!seat || this.room.status !== 'ended')
          return this.fail(conn, 'room.error.alreadyStarted');
        this.setSeat(seat.id, { ready: message.ready });
        this.touch();
        return this.broadcastRoom();
      case 'leave':
        return this.leave(conn, seat);
      default:
        return this.hostCommand(conn, seat, message);
    }
  }

  private hostCommand(
    conn: Conn,
    seat: StoredSeat | undefined,
    message: Extract<ClientMessage, { type: 'addBot' | 'removeSeat' | 'setTurnSeconds' | 'start' }>,
  ): void {
    const { room } = this;
    if (!seat?.host) return this.fail(conn, 'room.error.notHost');
    if (!betweenGames(room.status)) return this.fail(conn, 'room.error.alreadyStarted');
    this.touch();
    switch (message.type) {
      case 'addBot':
        if (room.seats.length >= MAX_SEATS) return this.fail(conn, 'room.error.full');
        this.update({
          nextSeatNo: room.nextSeatNo + 1,
          seats: [
            ...room.seats,
            {
              id: `p${room.nextSeatNo}`,
              name: null,
              cat: BOT_CAT[message.bot.personality],
              bot: message.bot,
              token: null,
              host: false,
              awaySince: null,
              standIn: false,
              timedOut: false,
              ready: true,
              wins: 0,
              sittingOut: null,
            },
          ],
        });
        break;
      case 'removeSeat': {
        const target = room.seats.find((s) => s.id === message.seatId);
        // Bots, and people who are no longer here; never someone who is connected.
        if (!target || target.host || (!target.bot && target.awaySince === null)) {
          return this.fail(conn, 'room.error.notHost');
        }
        this.update({ seats: room.seats.filter((s) => s.id !== target.id) });
        break;
      }
      case 'setTurnSeconds':
        this.update({ turnSeconds: message.seconds });
        break;
      case 'start': {
        const first = room.status === 'lobby';
        // First game: everyone here plays. A rematch: bots, the host, and whoever is ready.
        const plays = (s: StoredSeat) =>
          Boolean(s.bot) || (s.awaySince === null && (first || s.id === seat.id || s.ready));
        const players = room.seats.filter(plays);
        if (players.length < MIN_SEATS_TO_START) {
          return this.fail(
            conn,
            first ? 'room.error.notEnoughPlayers' : 'room.error.notEnoughReady',
          );
        }
        // The rest sit this game out: watching while there is space, otherwise waiting.
        let places =
          MAX_SPECTATORS - this.deps.conns().filter((c) => c.seatId === SPECTATOR).length;
        const seats = (first ? players : room.seats).map((s): StoredSeat => {
          if (plays(s)) return { ...s, ready: false, sittingOut: null };
          const watch = s.awaySince === null && places > 0;
          if (watch) places--;
          return { ...s, ready: false, sittingOut: watch ? 'watching' : 'waiting' };
        });
        const seed = `${room.code}-${Math.floor(this.deps.random() * 2 ** 32).toString(36)}`;
        const game = createGame({ playerIds: players.map((s) => s.id), seed });
        this.update({
          status: 'playing',
          gameNo: room.gameNo + 1,
          idleSince: null,
          seats,
          game,
          botRng: createRng(`bots:${seed}`).state,
          // Clients open the game with the round banner.
          showUntil: this.deps.now() + BEAT_MS.round,
          turnStart: {},
          due: {},
        });
        this.afterChange();
        this.broadcastRoom();
        this.broadcastView([]);
        return;
      }
    }
    this.broadcastRoom();
  }

  private leave(conn: Conn, seat: StoredSeat | undefined): void {
    const { room } = this;
    if (seat && (betweenGames(room.status) || seat.sittingOut)) {
      this.update({ seats: room.seats.filter((s) => s.id !== seat.id) });
      if (seat.host) this.passHost(seat.id, this.deps.conns());
    } else if (seat) {
      // Mid-game: a bot finishes the game in their place.
      this.setSeat(seat.id, { standIn: true, awaySince: this.deps.now() });
      if (seat.host) this.passHost(seat.id, this.deps.conns());
    }
    conn.seatId = SPECTATOR;
    this.broadcastRoom();
    conn.close(1000, 'left');
  }

  // ---------------------------------------------------------------- the game

  private play(action: Action, conn: Conn | null): boolean {
    const game = this.room.game;
    if (!game) return false;
    const result = applyAction(game, action);
    if (!result.ok) {
      if (conn) this.fail(conn, result.error);
      return false;
    }
    const now = this.deps.now();
    this.update({
      game: result.state,
      showUntil: Math.max(this.room.showUntil, now) + showTimeMs(result.events),
    });
    if (result.state.result) this.endGame(result.state.result.winners);
    this.afterChange(action.playerId);
    this.broadcastView(result.events);
    if (result.state.phase === 'gameOver') this.broadcastRoom();
    return true;
  }

  /** The game is over: count wins, and everyone is back between games (nobody ready yet). */
  private endGame(winners: readonly PlayerId[]): void {
    this.update({
      status: 'ended',
      idleSince: this.deps.now(),
      turnStart: {},
      due: {},
      seats: this.room.seats.map((s) => ({
        ...s,
        wins: s.wins + (winners.includes(s.id) ? 1 : 0),
        ready: false,
        sittingOut: null,
        standIn: false,
        timedOut: false,
      })),
    });
  }

  /** Someone did something after a game: the room is not idle. */
  private touch(): void {
    if (this.room.status !== 'ended') return;
    this.update({ idleSince: this.deps.now(), emptySince: null });
  }

  private inGame(id: PlayerId): boolean {
    return (
      this.room.status !== 'lobby' && Boolean(this.room.game?.players.some((p) => p.id === id))
    );
  }

  /** Seated people sitting a game out as spectators (they use spectator places). */
  private seatsWatching(): number {
    return this.room.seats.filter((s) => s.sittingOut === 'watching').length;
  }

  /**
   * Book-keeping after the game or a seat changed: turn timers and when automatic movers
   * play. Idempotent — `actor` (who just moved) gets a fresh thinking time.
   */
  private afterChange(actor?: PlayerId): void {
    const game = this.room.game;
    if (!game || this.room.status !== 'playing') return;
    const waiting = pendingActors(game);
    const turnStart: Record<PlayerId, number> = {};
    const due: Record<PlayerId, number> = {};
    for (const id of waiting) {
      turnStart[id] = this.room.turnStart[id] ?? this.room.showUntil;
      if (this.movesAutomatically(id)) {
        const previous = this.room.due[id];
        due[id] =
          previous === undefined || id === actor || previous < this.room.showUntil
            ? this.room.showUntil + this.thinkTime(id)
            : previous;
      }
    }
    // Whoever is no longer on the clock is no longer timed out.
    const seats = this.room.seats.map((s) =>
      s.timedOut && !waiting.includes(s.id) ? { ...s, timedOut: false } : s,
    );
    const next = { turnStart, due, seats };
    const current = { turnStart: this.room.turnStart, due: this.room.due, seats: this.room.seats };
    if (JSON.stringify(next) !== JSON.stringify(current)) this.update(next);
  }

  /** Bots, stand-ins, players out of time, and a forced last meow card. */
  private movesAutomatically(id: PlayerId): boolean {
    const seat = this.room.seats.find((s) => s.id === id);
    if (!seat) return false;
    return Boolean(seat.bot) || seat.standIn || seat.timedOut || this.isForcedBid(id);
  }

  private isForcedBid(id: PlayerId): boolean {
    const game = this.room.game;
    const player = game?.players.find((p) => p.id === id);
    return game?.phase === 'bidding' && player?.meowLeft.length === 1;
  }

  private thinkTime(id: PlayerId): number {
    const seat = this.room.seats.find((s) => s.id === id);
    if (!seat?.bot && !seat?.standIn && !seat?.timedOut) return AUTO_MOVE_MS;
    return BOT_DELAY_MS.min + this.deps.random() * (BOT_DELAY_MS.max - BOT_DELAY_MS.min);
  }

  /** Humans the game waits on who play for themselves (they have a turn timer). */
  private waitingHumans(): PlayerId[] {
    const game = this.room.game;
    if (!game) return [];
    return pendingActors(game).filter((id) => !this.movesAutomatically(id));
  }

  private deadlineOf(id: PlayerId): number | null {
    const start = this.room.turnStart[id];
    if (this.room.turnSeconds === 0 || start === undefined) return null;
    return start + this.room.turnSeconds * 1000;
  }

  /** Apply everything that is due by now: stand-ins, timeouts, bot moves, room expiry. */
  private runClock(): void {
    const now = this.deps.now();
    let seatsChanged = false;
    for (const seat of [...this.room.seats]) {
      if (seat.awaySince === null || seat.standIn || now - seat.awaySince < DISCONNECT_GRACE_MS) {
        continue;
      }
      if (betweenGames(this.room.status) || seat.sittingOut) {
        // Nobody holds a seat between games (or a spare one) for someone who is gone.
        this.update({ seats: this.room.seats.filter((s) => s.id !== seat.id) });
      } else {
        this.setSeat(seat.id, { standIn: true });
      }
      seatsChanged = true;
    }
    const { idleSince, emptySince, status } = this.room;
    if (status === 'ended' && emptySince === null && idleSince !== null) {
      // Nobody asked for another game for a while: count as empty (deleted later).
      if (now >= idleSince + RESULT_IDLE_MS)
        this.update({ emptySince: idleSince + RESULT_IDLE_MS });
    }
    if (this.room.status === 'playing') {
      for (const id of this.waitingHumans()) {
        const deadline = this.deadlineOf(id);
        if (deadline !== null && now >= deadline) {
          this.setSeat(id, { timedOut: true });
          seatsChanged = true;
        }
      }
      // Seats may have changed (back online, left, out of time): re-plan who moves by itself.
      this.afterChange();
      for (let guard = 0; guard < 50; guard++) {
        const next = Object.entries(this.room.due)
          .filter(([, at]) => at <= now)
          .sort((a, b) => a[1] - b[1])[0];
        if (!next || !this.autoMove(next[0])) break;
      }
    }
    if (seatsChanged) this.broadcastRoom();
  }

  private autoMove(id: PlayerId): boolean {
    const game = this.room.game;
    if (!game) return false;
    const seat = this.room.seats.find((s) => s.id === id);
    const player = game.players.find((p) => p.id === id);
    if (!seat || !player) return false;
    let action: Action | null;
    if (this.isForcedBid(id)) {
      action = { type: 'bid', playerId: id, value: player.meowLeft[0]! };
    } else {
      const bot = seat.bot ?? STAND_IN_BOT;
      const rng = createRng(this.room.botRng);
      action = chooseBotAction(bot.personality, bot.difficulty, getPlayerView(game, id), rng);
      this.update({ botRng: rng.state });
    }
    if (action && this.play(action, null)) return true;
    // Nothing to do (should not happen): stop retrying this mover.
    const { [id]: _dropped, ...due } = this.room.due;
    this.update({ due });
    return false;
  }

  // ---------------------------------------------------------------- output

  roomInfo(forSeat: PlayerId | null): RoomInfo {
    const conns = this.deps.conns();
    return {
      code: this.room.code,
      status: this.room.status,
      turnSeconds: this.room.turnSeconds,
      spectators: conns.filter((c) => c.seatId === SPECTATOR).length,
      you: forSeat,
      seats: this.room.seats.map((s) => ({
        id: s.id,
        name: s.name,
        cat: s.cat,
        bot: s.bot,
        host: s.host,
        connected: Boolean(s.bot) || s.awaySince === null,
        standIn: s.standIn,
        ready: Boolean(s.bot) || s.ready,
        wins: s.wins,
        sittingOut: s.sittingOut,
      })),
      gameNo: this.room.gameNo,
    };
  }

  private clocks(): TurnClock[] {
    const game = this.room.game;
    if (!game || this.room.status !== 'playing') return [];
    const now = this.deps.now();
    return pendingActors(game).map((playerId) => {
      const deadline = this.movesAutomatically(playerId) ? null : this.deadlineOf(playerId);
      return { playerId, remainingMs: deadline === null ? null : Math.max(0, deadline - now) };
    });
  }

  private sendView(conn: Conn, events: readonly GameEvent[]): void {
    const game = this.room.game;
    if (!game || conn.seatId === null) return;
    // Someone waiting out a game (no spectator place) does not see it.
    if (this.seatOf(conn)?.sittingOut === 'waiting') return;
    const viewer = conn.seatId !== SPECTATOR && this.inGame(conn.seatId) ? conn.seatId : null;
    conn.send({
      type: 'view',
      view: getPlayerView(game, viewer),
      events,
      clocks: this.clocks(),
    });
  }

  private broadcastView(events: readonly GameEvent[]): void {
    for (const conn of this.deps.conns()) this.sendView(conn, events);
  }

  private broadcastRoom(conns: readonly Conn[] = this.deps.conns()): void {
    for (const conn of conns) {
      if (conn.seatId === null) continue;
      conn.send({ type: 'room', room: this.roomInfo(conn.seatId || null) });
    }
  }

  private broadcast(message: ServerMessage): void {
    for (const conn of this.deps.conns()) if (conn.seatId !== null) conn.send(message);
  }

  private fail(conn: Conn, key: Extract<ServerMessage, { type: 'error' }>['key']): void {
    conn.send({ type: 'error', key });
  }

  private withinRate(conn: Conn): boolean {
    const now = this.deps.now();
    const rate = this.rates.get(conn.id);
    if (!rate || now - rate.start >= RATE_LIMIT.windowMs) {
      this.rates.set(conn.id, { start: now, count: 1 });
      return true;
    }
    rate.count++;
    return rate.count <= RATE_LIMIT.messages;
  }

  // ---------------------------------------------------------------- seats

  private seatOf(conn: Conn): StoredSeat | undefined {
    return conn.seatId ? this.room.seats.find((s) => s.id === conn.seatId) : undefined;
  }

  private setSeat(id: PlayerId, patch: Partial<StoredSeat>): void {
    this.update({ seats: this.room.seats.map((s) => (s.id === id ? { ...s, ...patch } : s)) });
  }

  private makeHost(id: PlayerId): void {
    this.update({ seats: this.room.seats.map((s) => ({ ...s, host: s.id === id })) });
  }

  /** The host left or dropped: the next connected person (in seat order) takes over. */
  private passHost(from: PlayerId, conns: readonly Conn[]): void {
    const next = this.room.seats.find(
      (s) => s.id !== from && !s.bot && conns.some((c) => c.seatId === s.id),
    );
    if (next) this.makeHost(next.id);
  }

  private update(patch: Partial<StoredRoom>): void {
    this.room = { ...this.room, ...patch };
    this.changed = true;
  }
}

export type { RoomErrorKey };

/** Bots keep their personality's cat colour online too. */
const BOT_CAT: Record<RoomBot['personality'], CatColor> = {
  greedy: 'orange',
  sly: 'black',
  careful: 'white',
};
