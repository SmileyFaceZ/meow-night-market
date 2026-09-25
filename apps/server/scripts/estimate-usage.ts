// Estimates what one online game costs against the Cloudflare Workers Free plan
// (docs/DEPLOY.md › โควตาแพ็กเกจฟรี). Plays whole games through RoomCore with a fake clock:
// people choose like the careful bot (so games are as long as real ones), think 2–6 s per
// move and ping every 30 s, like the real client. Counts:
//   - Durable Object requests: WebSocket connects, incoming messages (billed 20:1), alarms
//   - rows written: room saves (put), setAlarm / deleteAlarm
//   - Worker requests: room creation + WebSocket upgrades (static files are free)
//   - time the object is awake: events × an assumed cost per event (EVENT_MS)
//
// Run: node apps/server/scripts/estimate-usage.ts [--games 20]

import { chooseBotAction, createRng, type PlayerView, type Rng } from '@meow/engine';
import type { ClientMessage, ServerMessage } from '@meow/protocol';
import { type Conn, newRoom, RoomCore } from '../src/core.ts';

/** Assumed wall time the object stays awake per event (handler + storage), in ms. */
const EVENT_MS = 25;
const PING_EVERY_MS = 30_000;
const THINK_MS = { min: 2_000, max: 6_000 };
/** Workers Free plan, per day (Cloudflare docs, checked 2026-09-25). */
const FREE = {
  workerRequests: 100_000,
  doRequests: 100_000,
  rowsWritten: 100_000,
  gbSeconds: 13_000,
};
const DO_MEMORY_GB = 0.125;

const personMove = (view: PlayerView, rng: Rng) => chooseBotAction('careful', 'normal', view, rng);

interface Tally {
  humans: number;
  bots: number;
  minutes: number;
  workerRequests: number;
  connects: number;
  incoming: number;
  alarms: number;
  puts: number;
  alarmWrites: number;
  events: number;
}

function playOne(humans: number, bots: number, seed: number): Tally {
  let now = 0;
  const rng = createRng(`usage-${seed}`);
  const conns: TestConn[] = [];
  const core = new RoomCore(newRoom('ABCD', now), {
    now: () => now,
    random: () => rng.next(),
    token: () => `token-${Math.floor(rng.next() * 1e16)}-usage`,
    conns: () => conns,
  });
  const tally: Tally = {
    humans,
    bots,
    minutes: 0,
    workerRequests: 1, // POST /api/rooms
    connects: 0,
    incoming: 0,
    alarms: 0,
    puts: 1, // create() saves the new room
    alarmWrites: 1, // …and schedules its expiry
    events: 1,
  };
  let scheduled: number | null = core.nextWake();
  core.takeChanged();

  /**
   * What the Durable Object does after every event (mirrors GameRoom.save): the alarm only
   * ever moves earlier and is never deleted — an early or stale alarm just wakes the room.
   */
  const afterEvent = () => {
    tally.events++;
    if (core.takeChanged()) tally.puts++;
    const wake = core.nextWake();
    if (wake !== null && (scheduled === null || wake < scheduled)) {
      tally.alarmWrites++;
      scheduled = wake;
    }
  };

  class TestConn implements Conn {
    readonly id = `c${conns.length}`;
    seatId: string | null = null;
    view: PlayerView | null = null;
    actAt: number | null = null;
    pingAt = now + PING_EVERY_MS;
    send(message: ServerMessage) {
      if (message.type === 'view') this.view = message.view;
    }
    close() {}
    say(message: ClientMessage) {
      tally.incoming++;
      core.handleMessage(this, JSON.stringify(message));
      afterEvent();
    }
  }

  for (let i = 0; i < humans; i++) {
    const conn = new TestConn();
    conns.push(conn);
    tally.workerRequests++;
    tally.connects++;
    core.handleOpen();
    afterEvent();
    conn.say({ type: 'hello', name: `P${i}`, cat: 'calico' });
  }
  const host = conns[0]!;
  const bot = { personality: 'careful', difficulty: 'normal' } as const;
  for (let i = 0; i < bots; i++) host.say({ type: 'addBot', bot });
  host.say({ type: 'start' });
  const startedAt = now;

  for (let guard = 0; guard < 100_000 && core.state.status === 'playing'; guard++) {
    // People decide what to do and when.
    for (const conn of conns) {
      if (conn.actAt === null && conn.view && personMove(conn.view, rng)) {
        conn.actAt = now + THINK_MS.min + rng.next() * (THINK_MS.max - THINK_MS.min);
      }
    }
    const times = [
      scheduled ?? Infinity,
      ...conns.map((c) => c.actAt ?? Infinity),
      ...conns.map((c) => c.pingAt),
    ];
    now = Math.max(now, Math.min(...times));
    if (scheduled !== null && scheduled <= now) {
      tally.alarms++;
      scheduled = null;
      core.handleAlarm();
      afterEvent();
      continue;
    }
    for (const conn of conns) {
      if (conn.pingAt <= now) {
        conn.pingAt = now + PING_EVERY_MS;
        tally.incoming++; // answered by the auto-response, but counted to be safe
      }
      if (conn.actAt !== null && conn.actAt <= now) {
        conn.actAt = null;
        const action = conn.view && personMove(conn.view, rng);
        if (action) conn.say({ type: 'action', action });
      }
    }
  }
  if (core.state.status !== 'ended') throw new Error(`game ${seed} did not finish`);
  tally.minutes = (now - startedAt) / 60_000;
  // Everyone leaves; 30 minutes later the room wipes itself (one more alarm + delete).
  tally.alarms++;
  tally.alarmWrites++;
  tally.puts++;
  return tally;
}

function average(runs: Tally[]): Tally {
  const sum = (key: keyof Tally) => runs.reduce((s, r) => s + r[key], 0) / runs.length;
  return {
    humans: runs[0]!.humans,
    bots: runs[0]!.bots,
    minutes: sum('minutes'),
    workerRequests: sum('workerRequests'),
    connects: sum('connects'),
    incoming: sum('incoming'),
    alarms: sum('alarms'),
    puts: sum('puts'),
    alarmWrites: sum('alarmWrites'),
    events: sum('events'),
  };
}

const gamesArg = process.argv.indexOf('--games');
const GAMES = gamesArg > 0 ? Number(process.argv[gamesArg + 1]) : 20;
const TABLES: [humans: number, bots: number][] = [
  [2, 0],
  [2, 1],
  [3, 1],
  [4, 0],
  [1, 3],
];

const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
console.log(`${GAMES} games per table · ${EVENT_MS} ms awake per event (assumed)\n`);
for (const [humans, bots] of TABLES) {
  const t = average(Array.from({ length: GAMES }, (_, i) => playOne(humans, bots, i)));
  const doRequests = 1 + t.connects + t.incoming / 20 + t.alarms;
  const rows = t.puts + t.alarmWrites;
  const gbSeconds = (t.events * EVENT_MS * DO_MEMORY_GB) / 1000;
  const perDay = {
    'Worker requests': FREE.workerRequests / t.workerRequests,
    'DO requests': FREE.doRequests / doRequests,
    'rows written': FREE.rowsWritten / rows,
    'DO duration': FREE.gbSeconds / gbSeconds,
  };
  const [limit, games] = Object.entries(perDay).sort((a, b) => a[1] - b[1])[0]!;
  console.log(
    `${humans} people + ${bots} bots · ${t.minutes.toFixed(1)} min · ` +
      `DO requests ${fmt(doRequests)} (msgs ${fmt(t.incoming)}, alarms ${fmt(t.alarms)}) · ` +
      `rows written ${fmt(rows)} (saves ${fmt(t.puts)}, alarms ${fmt(t.alarmWrites)}) · ${gbSeconds.toFixed(1)} GB-s`,
  );
  console.log(
    `   → about ${fmt(games)} games/day before "${limit}" runs out ` +
      `(${Object.entries(perDay)
        .map(([k, v]) => `${k} ${fmt(v)}`)
        .join(' · ')})`,
  );
}
