import {
  applyAction,
  chooseRandomAction,
  createGame,
  createRng,
  type GameEvent,
  getPlayerView,
  pendingActors,
} from '@meow/engine';
import { describe, expect, it } from 'vitest';
import {
  BEAT_MS,
  clientMessageSchema,
  parseMessage,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_PATTERN,
  serverMessageSchema,
  showTimeMs,
} from '../src/index.ts';

describe('server messages', () => {
  it('accept every view and event of real games, for players and spectators', () => {
    for (const players of [2, 3, 4]) {
      let state = createGame({
        playerIds: Array.from({ length: players }, (_, i) => `p${i}`),
        seed: `schema-${players}`,
      });
      const rng = createRng(players);
      let events: readonly GameEvent[] = [];
      for (let step = 0; step < 2_000 && state.phase !== 'gameOver'; step++) {
        for (const viewer of [...state.players.map((p) => p.id), null]) {
          const message = { type: 'view', view: getPlayerView(state, viewer), events, clocks: [] };
          const parsed = parseMessage(serverMessageSchema, JSON.stringify(message));
          expect(parsed, `step ${step}`).toEqual(message);
        }
        const actor = pendingActors(state)[0]!;
        const action = chooseRandomAction(getPlayerView(state, actor), rng)!;
        const result = applyAction(state, action);
        if (!result.ok) throw new Error(result.error);
        state = result.state;
        events = result.events;
      }
      expect(state.phase).toBe('gameOver');
    }
  });

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
  it('adds up how long the screen shows a batch of events', () => {
    expect(showTimeMs([])).toBe(0);
    expect(showTimeMs([{ type: 'BID_PLACED', playerId: 'p0' }])).toBe(0);
    const round: GameEvent = { type: 'ROUND_STARTED', round: 2, tieOrder: ['p0'], market: [] };
    const skipped: GameEvent = { type: 'TURN_SKIPPED', playerId: 'p0' };
    expect(showTimeMs([round, skipped])).toBe(BEAT_MS.round + BEAT_MS.skipped);
  });
});
