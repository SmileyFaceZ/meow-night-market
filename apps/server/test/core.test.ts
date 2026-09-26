import { chooseRandomAction, createRng, type PlayerView } from '@meow/engine';
import {
  BEAT_MS,
  BOT_DELAY_MS,
  type ClientMessage,
  DISCONNECT_GRACE_MS,
  EMPTY_ROOM_TTL_MS,
  RATE_LIMIT,
  RESULT_IDLE_MS,
  type RoomInfo,
  roomInfoSchema,
  type ServerMessage,
} from '@meow/protocol';
import { describe, expect, it } from 'vitest';
import { ALARM_EARLY_MS, alarmTime, type Conn, newRoom, RoomCore } from '../src/core.ts';

/** A room with a fake clock and fake connections that record what they receive. */
function setup(code = 'ABCD') {
  let now = 1_000_000;
  let nextToken = 0;
  let nextConn = 0;
  const conns: TestConn[] = [];
  const rng = createRng('room-test');
  const core = new RoomCore(newRoom(code, now), {
    now: () => now,
    random: () => rng.next(),
    token: () => `token-${String(nextToken++).padStart(12, '0')}`,
    conns: () => conns.filter((c) => c.open),
  });

  class TestConn implements Conn {
    readonly id = `c${nextConn++}`;
    seatId: string | null = null;
    open = true;
    readonly inbox: ServerMessage[] = [];
    send(message: ServerMessage) {
      this.inbox.push(message);
    }
    close() {
      this.open = false;
    }
    last<T extends ServerMessage['type']>(type: T) {
      return this.inbox.filter((m) => m.type === type).at(-1) as
        Extract<ServerMessage, { type: T }> | undefined;
    }
    get view(): PlayerView | undefined {
      return this.last('view')?.view;
    }
    get room(): RoomInfo | undefined {
      return this.last('room')?.room;
    }
    get token(): string | undefined {
      return this.last('welcome')?.token;
    }
    say(message: ClientMessage) {
      core.handleMessage(this, JSON.stringify(message));
    }
  }

  const connect = (name = 'Cat', token?: string) => {
    const conn = new TestConn();
    conns.push(conn);
    core.handleOpen();
    conn.say({ type: 'hello', name, cat: 'calico', ...(token ? { token } : {}) });
    return conn;
  };
  const disconnect = (conn: TestConn) => {
    conn.open = false;
    core.handleClose(conn);
  };
  /** Let time pass, waking the room whenever its alarm would fire. */
  const advance = (ms: number) => {
    const end = now + ms;
    for (let guard = 0; guard < 10_000; guard++) {
      const wake = core.nextWake();
      if (wake === null || wake > end) break;
      now = Math.max(now, wake);
      core.handleAlarm();
    }
    now = end;
  };
  return {
    core,
    connect,
    disconnect,
    advance,
    get now() {
      return now;
    },
  };
}

type Room = ReturnType<typeof setup>;

function startTwoPlayers(room: Room) {
  const a = room.connect('Ann');
  const b = room.connect('Bo');
  a.say({ type: 'start' });
  return { a, b };
}

describe('lobby', () => {
  it('seats people in order; the first one is host', () => {
    const room = setup();
    const a = room.connect('Ann');
    const b = room.connect('Bo');
    expect(a.last('welcome')?.seatId).toBe('p0');
    expect(b.last('welcome')?.seatId).toBe('p1');
    expect(b.room?.seats.map((s) => [s.name, s.host])).toEqual([
      ['Ann', true],
      ['Bo', false],
    ]);
    expect(b.room?.you).toBe('p1');
    expect(a.token).not.toBe(b.token);
  });

  it('lets only the host add bots, set the timer and start', () => {
    const room = setup();
    const a = room.connect('Ann');
    const b = room.connect('Bo');
    b.say({ type: 'addBot', bot: { personality: 'sly', difficulty: 'normal' } });
    expect(b.last('error')?.key).toBe('room.error.notHost');
    a.say({ type: 'addBot', bot: { personality: 'sly', difficulty: 'normal' } });
    a.say({ type: 'setTurnSeconds', seconds: 60 });
    expect(b.room?.seats.map((s) => s.bot?.personality ?? s.name)).toEqual(['Ann', 'Bo', 'sly']);
    expect(b.room?.seats[2]?.cat).toBe('black');
    expect(b.room?.turnSeconds).toBe(60);
  });

  it('needs two seats to start', () => {
    const room = setup();
    const a = room.connect('Ann');
    a.say({ type: 'start' });
    expect(a.last('error')?.key).toBe('room.error.notEnoughPlayers');
    a.say({ type: 'addBot', bot: { personality: 'greedy', difficulty: 'easy' } });
    a.say({ type: 'start' });
    expect(a.room?.status).toBe('playing');
    expect(a.view?.viewer).toBe('p0');
  });

  it('makes the fifth person a spectator, and refuses a fifth spectator', () => {
    const room = setup();
    for (const name of ['A', 'B', 'C', 'D']) room.connect(name);
    const watchers = ['E', 'F', 'G', 'H'].map((n) => room.connect(n));
    expect(watchers[0]!.last('welcome')?.seatId).toBeNull();
    expect(watchers[0]!.room?.you).toBeNull();
    expect(watchers.at(-1)!.room?.spectators).toBe(4);
    const tooMany = room.connect('I');
    expect(tooMany.last('error')?.key).toBe('room.error.full');
    expect(tooMany.open).toBe(false);
  });

  it('passes host to the next person when the host drops, and frees the seat later', () => {
    const room = setup();
    const a = room.connect('Ann');
    const b = room.connect('Bo');
    room.disconnect(a);
    expect(b.room?.seats.find((s) => s.id === 'p1')?.host).toBe(true);
    expect(b.room?.seats.find((s) => s.id === 'p0')?.connected).toBe(false);
    room.advance(DISCONNECT_GRACE_MS);
    expect(b.room?.seats.map((s) => s.id)).toEqual(['p1']);
  });

  it('gives every seat its own cat', () => {
    const room = setup();
    const a = room.connect('Ann'); // calico
    const b = room.connect('Bo'); // asked for calico too
    expect(b.room?.seats.map((s) => s.cat)).toEqual(['calico', 'orange']);
    a.say({ type: 'addBot', bot: { personality: 'greedy', difficulty: 'normal' } });
    expect(new Set(a.room?.seats.map((s) => s.cat)).size).toBe(3);
    b.say({ type: 'updateMe', name: 'Bo', cat: 'calico' });
    expect(b.last('error')?.key).toBe('room.error.catTaken');
    b.say({ type: 'updateMe', name: 'Bo', cat: 'korat' });
    expect(a.room?.seats[1]?.cat).toBe('korat');
  });

  it('lets people rename themselves and leave', () => {
    const room = setup();
    const a = room.connect('Ann');
    const b = room.connect('Bo');
    b.say({ type: 'updateMe', name: '  Bobo ', cat: 'white' });
    expect(a.room?.seats[1]).toMatchObject({ name: 'Bobo', cat: 'white' });
    b.say({ type: 'leave' });
    expect(a.room?.seats.map((s) => s.id)).toEqual(['p0']);
    expect(b.open).toBe(false);
  });
});

describe('messages', () => {
  it('rejects junk, other players’ moves and floods', () => {
    const room = setup();
    const { a, b } = startTwoPlayers(room);
    room.core.handleMessage(a, '{not json');
    expect(a.last('error')?.key).toBe('room.error.badMessage');
    a.say({ type: 'action', action: { type: 'bid', playerId: 'p1', value: 3 } });
    expect(a.last('error')?.key).toBe('room.error.notSeated');
    a.say({ type: 'action', action: { type: 'bid', playerId: 'p0', value: 9 } });
    expect(a.last('error')?.key).toBe('error.meowUsed');
    for (let i = 0; i < RATE_LIMIT.messages + 1; i++) b.say({ type: 'ping' });
    expect(b.last('error')?.key).toBe('room.error.tooFast');
  });

  it('broadcasts stickers, at most one per cooldown', () => {
    const room = setup();
    const { a, b } = startTwoPlayers(room);
    a.say({ type: 'emote', id: 'yum' });
    a.say({ type: 'emote', id: 'wow' });
    expect(b.inbox.filter((m) => m.type === 'emote')).toEqual([
      { type: 'emote', from: 'p0', id: 'yum' },
    ]);
  });
});

describe('game', () => {
  it('keeps each bid secret until everyone has bid', () => {
    const room = setup();
    const { a, b } = startTwoPlayers(room);
    a.say({ type: 'action', action: { type: 'bid', playerId: 'p0', value: 4 } });
    expect(a.view?.yourBid).toBe(4);
    const ann = b.view?.players.find((p) => p.id === 'p0');
    expect(ann).toMatchObject({ hasBid: true, revealedBid: null });
    expect(b.view?.yourBid).toBeNull();
    expect(b.last('view')?.events).toEqual([{ type: 'BID_PLACED', playerId: 'p0' }]);
  });

  it('lets bots move only after the screen has shown the last events', () => {
    const room = setup();
    const a = room.connect('Ann');
    a.say({ type: 'addBot', bot: { personality: 'greedy', difficulty: 'normal' } });
    const startedAt = room.now;
    a.say({ type: 'start' });
    room.advance(BEAT_MS.round + BOT_DELAY_MS.min - 1);
    expect(a.view?.players.find((p) => p.id === 'p1')?.hasBid).toBe(false);
    room.advance(BOT_DELAY_MS.max - BOT_DELAY_MS.min + 1);
    expect(a.view?.players.find((p) => p.id === 'p1')?.hasBid).toBe(true);
    expect(room.now - startedAt).toBeGreaterThanOrEqual(BEAT_MS.round + BOT_DELAY_MS.min);
  });

  it('shows who is on the clock and plays for someone who runs out of time', () => {
    const room = setup();
    const { a, b } = startTwoPlayers(room);
    a.say({ type: 'setTurnSeconds', seconds: 30 }); // lobby only: refused now
    expect(a.last('error')?.key).toBe('room.error.alreadyStarted');
    const clocks = b.last('view')!.clocks;
    expect(clocks.map((c) => c.playerId)).toEqual(['p0', 'p1']);
    expect(clocks[0]!.remainingMs).toBe(45_000 + BEAT_MS.round);
    a.say({ type: 'action', action: { type: 'bid', playerId: 'p0', value: 2 } });
    room.advance(45_000 + BEAT_MS.round + BOT_DELAY_MS.max);
    expect(a.view?.phase).not.toBe('bidding');
    expect(b.room?.seats.find((s) => s.id === 'p1')?.standIn).toBe(false);
  });

  it('puts a bot in for someone who drops out, and gives the seat back on return', () => {
    const room = setup();
    const { a, b } = startTwoPlayers(room);
    a.say({ type: 'action', action: { type: 'bid', playerId: 'p0', value: 5 } });
    const token = b.token!;
    room.disconnect(b);
    expect(a.room?.seats[1]).toMatchObject({ connected: false, standIn: false });
    room.advance(DISCONNECT_GRACE_MS + BOT_DELAY_MS.max);
    expect(a.room?.seats[1]?.standIn).toBe(true);
    expect(a.view?.players.find((p) => p.id === 'p1')?.meowLeft).toHaveLength(4);

    const back = room.connect('Bo', token);
    expect(back.last('welcome')?.seatId).toBe('p1');
    expect(back.view?.viewer).toBe('p1');
    expect(a.room?.seats[1]).toMatchObject({ connected: true, standIn: false });
  });

  it('shows spectators the game without anyone’s secrets', () => {
    const room = setup();
    const { a } = startTwoPlayers(room);
    a.say({ type: 'action', action: { type: 'bid', playerId: 'p0', value: 1 } });
    const watcher = room.connect('Eve');
    expect(watcher.room?.you).toBeNull();
    expect(watcher.view?.viewer).toBeNull();
    expect(watcher.view?.yourBid).toBeNull();
    watcher.say({ type: 'emote', id: 'meow' });
    expect(watcher.last('error')?.key).toBe('room.error.notSeated');
  });

  it.each([1, 2, 3])('plays whole games with people and a bot, then a rematch (%i)', (seed) => {
    const room = setup(`GAM${'ABC'[seed - 1]}`);
    const a = room.connect('Ann');
    const b = room.connect('Bo');
    a.say({ type: 'addBot', bot: { personality: 'careful', difficulty: 'normal' } });
    a.say({ type: 'start' });
    const firstDeal = room.core.state.game!.trashDeck.map((c) => c.id);
    playToEnd(room, [a, b], seed);
    expect(a.room?.status).toBe('ended');
    expect(a.view?.result?.scores).toHaveLength(3);
    expect(b.view?.result).toEqual(a.view?.result);
    const winners = a.view!.result!.winners;
    expect(a.room?.seats.map((s) => s.wins)).toEqual(
      a.room!.seats.map((s) => (winners.includes(s.id) ? 1 : 0)),
    );
    // Nobody is ready yet, except the bot.
    expect(a.room?.seats.map((s) => s.ready)).toEqual([false, false, true]);

    b.say({ type: 'ready', ready: true });
    expect(a.room?.seats[1]?.ready).toBe(true);
    b.say({ type: 'start' });
    expect(b.last('error')?.key).toBe('room.error.notHost');
    a.say({ type: 'start' });
    expect(b.room).toMatchObject({ status: 'playing', gameNo: 2 });
    expect(b.view?.round).toBe(1);
    // A new seed every game.
    expect(room.core.state.game!.trashDeck.map((c) => c.id)).not.toEqual(firstDeal);
    expect(b.room?.seats.map((s) => s.sittingOut)).toEqual([null, null, null]);
  });
});

/** Everyone seated plays random legal moves until the game ends. */
function playToEnd(room: Room, conns: ReturnType<Room['connect']>[], seed: number) {
  const rng = createRng(seed);
  for (let step = 0; step < 5_000 && conns[0]!.room?.status === 'playing'; step++) {
    for (const conn of conns) {
      const view = conn.view;
      if (!view?.viewer) continue;
      const action = chooseRandomAction(view, rng);
      if (action) conn.say({ type: 'action', action });
    }
    room.advance(2_000);
  }
  expect(conns[0]!.room?.status).toBe('ended');
}

describe('rematch', () => {
  function finishedRoom(names: string[]) {
    const room = setup();
    const conns = names.map((n) => room.connect(n));
    conns[0]!.say({ type: 'start' });
    playToEnd(room, conns, 7);
    return { room, conns };
  }

  it('needs two ready seats: the host counts, bots always do', () => {
    const { conns } = finishedRoom(['Ann', 'Bo']);
    const [a] = conns;
    a!.say({ type: 'start' });
    expect(a!.last('error')?.key).toBe('room.error.notEnoughReady');
    a!.say({ type: 'addBot', bot: { personality: 'greedy', difficulty: 'easy' } });
    a!.say({ type: 'start' });
    expect(a!.room?.status).toBe('playing');
  });

  it('lets someone who is not ready watch, keeps their wins, and seats them again later', () => {
    const { room, conns } = finishedRoom(['Ann', 'Bo', 'Cy']);
    const [a, b, c] = conns as [TestConnOf<Room>, TestConnOf<Room>, TestConnOf<Room>];
    const cWins = c.room!.seats[2]!.wins;
    b.say({ type: 'ready', ready: true });
    a.say({ type: 'start' });
    expect(a.room?.seats.map((s) => s.sittingOut)).toEqual([null, null, 'watching']);
    expect(a.view?.players.map((p) => p.id)).toEqual(['p0', 'p1']);
    expect(c.view?.viewer).toBeNull();
    c.say({ type: 'action', action: { type: 'bid', playerId: 'p2', value: 1 } });
    expect(c.last('error')?.key).toBe('room.error.notSeated');
    c.say({ type: 'emote', id: 'meow' });
    expect(c.last('error')?.key).toBe('room.error.notSeated');

    playToEnd(room, [a, b], 3);
    expect(a.room?.seats[2]).toMatchObject({ sittingOut: null, wins: cWins, ready: false });
    c.say({ type: 'ready', ready: true });
    b.say({ type: 'ready', ready: true });
    a.say({ type: 'start' });
    expect(c.view?.viewer).toBe('p2');
  });

  it('keeps someone in the waiting room when all spectator places are taken', () => {
    const room = setup();
    const [a, b, c] = ['Ann', 'Bo', 'Cy'].map((n) => room.connect(n));
    a!.say({ type: 'start' });
    const watchers = [1, 2, 3, 4].map((i) => room.connect(`W${i}`));
    expect(watchers.every((w) => w.last('welcome')?.seatId === null)).toBe(true);
    playToEnd(room, [a!, b!, c!], 5);
    b!.say({ type: 'ready', ready: true });
    const viewsBefore = c!.inbox.filter((m) => m.type === 'view').length;
    a!.say({ type: 'start' });
    expect(c!.room?.seats[2]?.sittingOut).toBe('waiting');
    expect(c!.inbox.filter((m) => m.type === 'view')).toHaveLength(viewsBefore);
  });

  it('seats a newcomer between games, not ready yet; leaving frees the seat', () => {
    const { room, conns } = finishedRoom(['Ann', 'Bo']);
    const newcomer = room.connect('Dee');
    expect(newcomer.last('welcome')?.seatId).toBe('p2');
    expect(newcomer.room?.seats[2]).toMatchObject({ name: 'Dee', ready: false, wins: 0 });
    conns[1]!.say({ type: 'leave' });
    expect(newcomer.room?.seats.map((s) => s.name)).toEqual(['Ann', 'Dee']);
  });

  it('lets people change their cat and the host change settings between games', () => {
    const { conns } = finishedRoom(['Ann', 'Bo']);
    const [a, b] = conns;
    b!.say({ type: 'updateMe', name: 'Bobo', cat: 'white' });
    a!.say({ type: 'setTurnSeconds', seconds: 90 });
    expect(a!.room?.seats[1]).toMatchObject({ name: 'Bobo', cat: 'white' });
    expect(a!.room?.turnSeconds).toBe(90);
  });

  it('counts as empty after 10 idle minutes on the results, unless someone acts', () => {
    const { room, conns } = finishedRoom(['Ann', 'Bo']);
    room.advance(RESULT_IDLE_MS - 1_000);
    conns[1]!.say({ type: 'ready', ready: true });
    room.advance(RESULT_IDLE_MS - 1_000);
    expect(room.core.state.emptySince).toBeNull();
    room.advance(1_000);
    expect(room.core.state.emptySince).not.toBeNull();
    room.advance(EMPTY_ROOM_TTL_MS);
    expect(room.core.expired).toBe(true);
  });
});

type TestConnOf<R extends Room> = ReturnType<R['connect']>;

describe('game mode', () => {
  it('lets the host pick Market Mayhem: the next game has powers and events', () => {
    const room = setup();
    const a = room.connect('Ann');
    const b = room.connect('Bo');
    a.say({ type: 'addBot', bot: { personality: 'greedy', difficulty: 'normal' } });
    b.say({ type: 'setMode', powers: true, events: true });
    expect(b.last('error')?.key).toBe('room.error.notHost');
    a.say({ type: 'setMode', powers: true, events: true });
    expect(b.room?.mode).toEqual({ powers: true, events: true });
    expect(new Set(b.room?.seats.map((s) => s.cat)).size).toBe(3);
    a.say({ type: 'start' });
    const view = a.view!;
    expect(view.powersOn).toBe(true);
    expect(view.eventsOn).toBe(true);
    expect(view.players.map((p) => p.cat)).toEqual(b.room!.seats.map((s) => s.cat));
  });
});

describe('after a deploy', () => {
  it('carries on a game saved by an older version (fields added since are filled in)', () => {
    const room = setup();
    const a = room.connect('Ann');
    a.say({ type: 'addBot', bot: { personality: 'greedy', difficulty: 'normal' } });
    a.say({ type: 'start' });
    // What an older version stored: the game without the newer fields.
    const stored = JSON.parse(JSON.stringify(room.core.state)) as {
      game: Record<string, unknown>;
    };
    for (const key of ['powers', 'faceDown', 'passes', 'events', 'setAsideDogs', 'dogsSlept']) {
      delete stored.game[key];
    }
    const revived = new RoomCore(stored as never, {
      now: () => room.now + 60_000,
      random: () => 0.5,
      token: () => 'token-000000000000',
      conns: () => [],
    });
    expect(() => revived.handleAlarm()).not.toThrow();
    expect(revived.state.game?.faceDown).toEqual([]);
    // Room fields added with rematch are filled in too.
    const oldRoom = JSON.parse(JSON.stringify(room.core.state)) as Record<string, unknown> & {
      seats: Record<string, unknown>[];
    };
    delete oldRoom.gameNo;
    delete oldRoom.idleSince;
    for (const seat of oldRoom.seats) {
      delete seat.ready;
      delete seat.wins;
      delete seat.sittingOut;
    }
    const info = new RoomCore(oldRoom as never, {
      now: () => room.now,
      random: () => 0.5,
      token: () => 'token-000000000000',
      conns: () => [],
    }).roomInfo(null);
    expect(roomInfoSchema.safeParse(info).success).toBe(true);
    expect(info.seats[0]).toMatchObject({ wins: 0, ready: false, sittingOut: null });
  });
});

describe('room lifetime', () => {
  it('expires 30 minutes after the last person leaves', () => {
    const room = setup();
    const a = room.connect('Ann');
    room.disconnect(a);
    // (an alarm counts as on time up to ALARM_EARLY_MS before it is due)
    room.advance(EMPTY_ROOM_TTL_MS - ALARM_EARLY_MS - 1);
    expect(room.core.expired).toBe(false);
    room.advance(1);
    expect(room.core.expired).toBe(true);
  });

  it('asks to be woken for the next thing due', () => {
    const room = setup();
    expect(room.core.nextWake()).toBe(room.now + EMPTY_ROOM_TTL_MS);
    room.connect('Ann');
    expect(room.core.nextWake()).toBeNull();
  });
});

/**
 * The room as the Durable Object runs it in production: every event rebuilds the room from
 * storage (hibernation), alarms are whole milliseconds, may run a little early, and an
 * alarm re-armed for the moment of the one that is running is lost (what stalled bots
 * until someone sent a message — fix/playtest-1).
 */
function productionRoom(earlyMs: number) {
  let now = 1_000_000;
  const rng = createRng('alarm-test');
  const late: number[] = [];
  const inbox: ServerMessage[] = [];
  const conn: Conn = {
    id: 'c0',
    seatId: null,
    send: (m) => inbox.push(m),
    close: () => {},
  };
  const deps = {
    now: () => now,
    random: () => rng.next(),
    token: () => 'token-000000000000',
    conns: () => [conn],
    warn: (_event: string, data: Record<string, unknown>) => late.push(Number(data.lateMs)),
  };
  let stored = newRoom('ABCD', now);
  let alarm: number | null = null;
  let lost = 0;
  const event = (inAlarm: boolean, run: (core: RoomCore) => void) => {
    const core = new RoomCore(structuredClone(stored), deps);
    run(core);
    stored = core.state;
    const at = alarmTime(core.nextWake(), inAlarm ? null : alarm, now);
    if (at !== null) alarm = at;
  };
  const say = (message: ClientMessage) =>
    event(false, (core) => core.handleMessage(conn, JSON.stringify(message)));
  /** Let alarms (and only alarms) run until `ms` from now. */
  const runAlarms = (ms: number) => {
    const end = now + ms;
    for (let guard = 0; guard < 10_000 && alarm !== null && alarm <= end; guard++) {
      const scheduled = alarm;
      alarm = null;
      now = Math.max(now, scheduled - earlyMs);
      event(true, (core) => core.handleAlarm());
      if (alarm !== null && alarm <= scheduled) {
        alarm = null; // re-armed for the running alarm's own time: production skips it
        lost++;
      }
    }
  };
  return {
    say,
    runAlarms,
    get room() {
      return stored;
    },
    get lost() {
      return lost;
    },
    late,
    views: () => inbox.filter((m) => m.type === 'view').length,
  };
}

describe('alarms (production timing)', () => {
  it('never re-arms at or before the alarm that is running', () => {
    expect(alarmTime(null, null, 1000)).toBeNull();
    // a fractional due time (older rooms) reached a hair early: pushed past the window
    expect(alarmTime(1000.6, null, 1000)).toBe(1000 + ALARM_EARLY_MS + 1);
    expect(alarmTime(5000.2, null, 1000)).toBe(5001);
    // outside an alarm: only ever moved earlier (each set is a billed write)
    expect(alarmTime(5000, 4000, 1000)).toBeNull();
    expect(alarmTime(3000, 4000, 1000)).toBe(3000);
  });

  for (const earlyMs of [0, 1, 20]) {
    it(`bots and turn timers keep going with nobody sending anything (alarm ${earlyMs} ms early)`, () => {
      const room = productionRoom(earlyMs);
      room.say({ type: 'hello', name: 'Ann', cat: 'calico' });
      room.say({ type: 'setMode', powers: true, events: true });
      for (let i = 0; i < 3; i++) {
        room.say({ type: 'addBot', bot: { personality: 'greedy', difficulty: 'normal' } });
      }
      room.say({ type: 'start' });
      // Ann never plays: her 45 s turn timer runs out each time and a bot finishes for her.
      room.runAlarms(60 * 60_000);
      expect(room.room.status).toBe('ended');
      expect(room.lost).toBe(0);
      expect(room.late).toEqual([]);
      expect(room.views()).toBeGreaterThan(50);
    });
  }
});
