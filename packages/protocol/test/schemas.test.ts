import {
  applyAction,
  CAT_IDS,
  chooseRandomAction,
  createGame,
  createRng,
  type GameEvent,
  getPlayerView,
  pendingActors,
} from '@meow/engine';
import { describe, expect, it } from 'vitest';
import {
  beatDuration,
  POPUP_MIN_MS,
  TOAST_MS,
  clientMessageSchema,
  parseMessage,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_PATTERN,
  serverMessageSchema,
  showTiming,
} from '../src/index.ts';

describe('server messages', () => {
  it.each(['classic', 'powers', 'events', 'chaos'] as const)(
    'accept every view, event and action of real games (%s), for players and spectators',
    (mode) => {
      for (const players of [2, 3, 4]) {
        const playerIds = Array.from({ length: players }, (_, i) => `p${i}`);
        // Powers mode: spread the 8 cats over seats and seeds so every power turns up.
        const cats = Object.fromEntries(
          playerIds.map((id, i) => [id, CAT_IDS[(i * 3 + players) % CAT_IDS.length]!]),
        );
        let state = createGame({
          playerIds,
          seed: `schema-${players}`,
          ...(mode === 'powers' || mode === 'chaos' ? { cats } : {}),
          events: mode === 'events' || mode === 'chaos',
        });
        const rng = createRng(players);
        let events: readonly GameEvent[] = [];
        for (let step = 0; step < 2_000 && state.phase !== 'gameOver'; step++) {
          for (const viewer of [...state.players.map((p) => p.id), null]) {
            const message = {
              type: 'view',
              view: getPlayerView(state, viewer),
              events,
              clocks: [],
            };
            const parsed = parseMessage(serverMessageSchema, JSON.stringify(message));
            expect(parsed, `step ${step}`).toEqual(message);
          }
          const actor = pendingActors(state)[0]!;
          const action = chooseRandomAction(getPlayerView(state, actor), rng)!;
          const sent = { type: 'action', action };
          expect(parseMessage(clientMessageSchema, JSON.stringify(sent))).toEqual(sent);
          const result = applyAction(state, action);
          if (!result.ok) throw new Error(result.error);
          state = result.state;
          events = result.events;
        }
        expect(state.phase).toBe('gameOver');
      }
    },
  );

  it('reject malformed messages', () => {
    for (const raw of ['nope', '{}', '{"type":"error","key":"hack"}', 42]) {
      expect(parseMessage(serverMessageSchema, raw)).toBeNull();
    }
  });
});

describe('client messages', () => {
  it('accept the moves the game uses', () => {
    const ok = [
      { type: 'hello', name: 'มะลิ', cat: 'calico' },
      { type: 'action', action: { type: 'eat', playerId: 'p0', cardIds: [1, 2, 3] } },
      { type: 'addBot', bot: { personality: 'sly', difficulty: 'easy' } },
      { type: 'setTurnSeconds', seconds: 0 },
      { type: 'emote', id: 'gg' },
    ];
    for (const message of ok) {
      expect(parseMessage(clientMessageSchema, JSON.stringify(message))).not.toBeNull();
    }
  });

  it('reject names that are too long, unknown actions and odd timers', () => {
    const bad = [
      { type: 'hello', name: 'x'.repeat(13), cat: 'calico' },
      { type: 'hello', name: 'A', cat: 'tiger' },
      { type: 'action', action: { type: 'steal', playerId: 'p0' } },
      { type: 'action', action: { type: 'bid', playerId: 'p0', value: 1.5 } },
      { type: 'setTurnSeconds', seconds: 7 },
      { type: 'emote', id: 'anything' },
      { type: 'hello', name: 'A', cat: 'calico', token: 'short' },
    ];
    for (const message of bad) {
      expect(parseMessage(clientMessageSchema, JSON.stringify(message))).toBeNull();
    }
  });
});

describe('room codes', () => {
  it('avoid look-alike characters', () => {
    for (const c of 'IOL01') expect(ROOM_CODE_ALPHABET).not.toContain(c);
    expect('ABCD').toMatch(ROOM_CODE_PATTERN);
    expect('ABC').not.toMatch(ROOM_CODE_PATTERN);
    expect('ABCO').not.toMatch(ROOM_CODE_PATTERN);
  });
});

describe('pacing', () => {
  const round: GameEvent = {
    type: 'ROUND_STARTED',
    round: 2,
    tieOrder: ['p0', 'p1', 'p2', 'p3'],
    market: [],
    faceDown: 0,
  };
  const skipped: GameEvent = { type: 'TURN_SKIPPED', playerId: 'p0' };

  it('adds up how long the screens show a batch, and when its last popup ends', () => {
    expect(showTiming([])).toEqual({ totalMs: 0, popupEndMs: 0 });
    expect(showTiming([{ type: 'BID_PLACED', playerId: 'p0' }]).totalMs).toBe(0);
    const banner = beatDuration({ kind: 'round', round: 2, tieOrder: round.tieOrder });
    expect(showTiming([round, skipped])).toEqual({
      totalMs: banner + TOAST_MS.skipped!,
      popupEndMs: banner,
    });
  });

  it('popups stay at least 3 s at every speed, longer with more to read, longest in Thai', () => {
    const dog = { kind: 'dog', playerId: 'p0', canThrowBone: false } as const;
    const event = { kind: 'event', round: 1, event: 'gustyWind' } as const;
    for (const speed of ['slow', 'normal', 'fast'] as const) {
      expect(beatDuration(dog, null, { speed, lang: 'en' })).toBeGreaterThanOrEqual(POPUP_MIN_MS);
    }
    const th = beatDuration(event, null, { speed: 'normal', lang: 'th' });
    const en = beatDuration(event, null, { speed: 'normal', lang: 'en' });
    expect(th).toBeGreaterThan(en);
    expect(beatDuration(event)).toBe(Math.max(th, en)); // the server waits for the slowest
    expect(beatDuration(event, null, { speed: 'slow', lang: 'th' })).toBeGreaterThan(th);
    expect(beatDuration(event, null, { speed: 'fast', lang: 'th' })).toBeLessThan(th);
  });

  it('toasts scale with the speed', () => {
    const pick = { kind: 'pick', playerId: 'p1', card: { id: 1, kind: 'fish' } } as const;
    expect(beatDuration(pick, null, { speed: 'fast', lang: 'th' })).toBe(
      Math.round(TOAST_MS.pick! * 0.7),
    );
  });
});
