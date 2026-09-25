import { createGame, getPlayerView } from '@meow/engine';
import type { ClientMessage, RoomInfo, ServerMessage } from '@meow/protocol';
import { describe, expect, it } from 'vitest';
import { EMOTE_SHOW_MS, RemoteController, type SocketLike } from '../src/game/online';
import { manualScheduler } from './helpers';

class FakeSocket implements SocketLike {
  onopen: (() => void) | null = null;
  onmessage: ((event: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  readonly sent: ClientMessage[] = [];
  closed = false;
  readonly url: string;
  constructor(url: string) {
    this.url = url;
  }
  send(data: string) {
    this.sent.push(JSON.parse(data) as ClientMessage);
  }
  close() {
    this.closed = true;
  }
  receive(message: ServerMessage) {
    this.onmessage?.({ data: JSON.stringify(message) });
  }
}

function setup(stored: Record<string, string> = {}) {
  const sockets: FakeSocket[] = [];
  const timers = manualScheduler();
  const tokens = {
    data: { ...stored },
    getItem(key: string) {
      return this.data[key] ?? null;
    },
    setItem(key: string, value: string) {
      this.data[key] = value;
    },
  };
  const controller = new RemoteController({
    code: 'ABCD',
    profile: { name: 'Ann', cat: 'calico' },
    origin: 'https://meow.example',
    connect: (url) => {
      const socket = new FakeSocket(url);
      sockets.push(socket);
      return socket;
    },
    scheduler: timers.scheduler,
    tokens,
  });
  const socket = () => sockets.at(-1)!;
  return { controller, sockets, socket, timers, tokens };
}

const room = (status: RoomInfo['status']): RoomInfo => ({
  code: 'ABCD',
  status,
  turnSeconds: 45,
  spectators: 0,
  you: 'p0',
  gameNo: 1,
  mode: { powers: false, events: false },
  seats: [
    {
      id: 'p0',
      name: 'Ann',
      cat: 'calico',
      bot: null,
      host: true,
      connected: true,
      standIn: false,
      ready: false,
      wins: 0,
      sittingOut: null,
    },
    {
      id: 'p1',
      name: 'Bo',
      cat: 'orange',
      bot: null,
      host: false,
      connected: false,
      standIn: true,
      ready: false,
      wins: 0,
      sittingOut: null,
    },
  ],
});
const game = createGame({ playerIds: ['p0', 'p1'], seed: 'online' });
const TOKEN = 'abcdefghijklmnop1234';

describe('RemoteController', () => {
  it('connects to the room and says hello with the saved token', () => {
    const { socket, controller } = setup({ 'mnm.room.ABCD': TOKEN });
    expect(socket().url).toBe('wss://meow.example/api/rooms/ABCD/ws');
    expect(controller.getOnline().connection).toBe('connecting');
    socket().onopen?.();
    expect(socket().sent).toEqual([{ type: 'hello', name: 'Ann', cat: 'calico', token: TOKEN }]);
    expect(controller.getOnline().connection).toBe('open');
  });

  it('keeps the seat token and builds the game snapshot from views', () => {
    const { socket, controller, tokens } = setup();
    socket().onopen?.();
    socket().receive({ type: 'welcome', token: TOKEN, seatId: 'p0' });
    expect(tokens.data['mnm.room.ABCD']).toBe(TOKEN);
    socket().receive({ type: 'room', room: room('playing') });
    expect(controller.getOnline().game).toBeNull();

    const view = getPlayerView(game, 'p0');
    socket().receive({
      type: 'view',
      view,
      events: [{ type: 'BID_PLACED', playerId: 'p1' }],
      clocks: [{ playerId: 'p0', remainingMs: 30_000 }],
    });
    const snap = controller.getSnapshot();
    expect(snap.view).toEqual(view);
    expect(snap.eventCount).toBe(1);
    expect(snap.seats.map((s) => s.name)).toEqual(['Ann', 'Bo']);
    expect(snap.online?.presence).toEqual({ p1: 'standIn' });
    expect(snap.online?.clocks[0]?.deadline).toBeGreaterThan(Date.now() + 29_000);
  });

  it('only sends its own moves', () => {
    const { socket, controller } = setup();
    socket().onopen?.();
    socket().receive({ type: 'welcome', token: TOKEN, seatId: 'p0' });
    expect(controller.dispatch({ type: 'bid', playerId: 'p1', value: 2 })).toBe(
      'room.error.notSeated',
    );
    expect(controller.dispatch({ type: 'bid', playerId: 'p0', value: 2 })).toBeNull();
    expect(socket().sent.at(-1)).toEqual({
      type: 'action',
      action: { type: 'bid', playerId: 'p0', value: 2 },
    });
  });

  it('reconnects after a drop, with the token, without replaying old events', () => {
    const { socket, sockets, controller, timers } = setup();
    socket().onopen?.();
    socket().receive({ type: 'welcome', token: TOKEN, seatId: 'p0' });
    socket().receive({ type: 'room', room: room('playing') });
    socket().receive({
      type: 'view',
      view: getPlayerView(game, 'p0'),
      events: [{ type: 'BID_PLACED', playerId: 'p1' }],
      clocks: [],
    });
    socket().onclose?.();
    expect(controller.getOnline().connection).toBe('reconnecting');
    timers.flushNext();
    expect(sockets).toHaveLength(2);
    socket().onopen?.();
    expect(socket().sent[0]).toMatchObject({ type: 'hello', token: TOKEN });
    socket().receive({ type: 'view', view: getPlayerView(game, 'p0'), events: [], clocks: [] });
    expect(controller.getSnapshot().eventCount).toBe(1);
  });

  it('stops for good when the room does not exist', () => {
    const { socket, sockets, controller, timers } = setup();
    socket().onopen?.();
    socket().receive({ type: 'error', key: 'room.error.notFound' });
    socket().onclose?.();
    timers.flush();
    expect(sockets).toHaveLength(1);
    expect(controller.getOnline().problem).toBe('notFound');
  });

  it('shows stickers for a few seconds', () => {
    const { socket, controller, timers } = setup();
    socket().onopen?.();
    socket().receive({ type: 'welcome', token: TOKEN, seatId: 'p0' });
    socket().receive({ type: 'room', room: room('playing') });
    socket().receive({ type: 'view', view: getPlayerView(game, 'p0'), events: [], clocks: [] });
    socket().receive({ type: 'emote', from: 'p1', id: 'yum' });
    expect(controller.getSnapshot().online?.emotes.map((e) => e.id)).toEqual(['yum']);
    expect(timers.nextDelay()).toBe(EMOTE_SHOW_MS);
    timers.flushNext();
    expect(controller.getSnapshot().online?.emotes).toEqual([]);
  });

  it('starts a rematch with a fresh history, and watches while sitting a game out', () => {
    const { socket, controller } = setup();
    socket().onopen?.();
    socket().receive({ type: 'welcome', token: TOKEN, seatId: 'p0' });
    socket().receive({ type: 'room', room: room('playing') });
    socket().receive({
      type: 'view',
      view: getPlayerView(game, 'p0'),
      events: [{ type: 'BID_PLACED', playerId: 'p1' }],
      clocks: [],
    });
    expect(controller.getSnapshot().eventCount).toBe(1);

    const next = { ...room('playing'), gameNo: 2 };
    const benched = {
      ...next,
      seats: next.seats.map((s) => (s.id === 'p0' ? { ...s, sittingOut: 'watching' as const } : s)),
    };
    socket().receive({ type: 'room', room: benched });
    socket().receive({ type: 'view', view: getPlayerView(game, null), events: [], clocks: [] });
    expect(controller.getSnapshot().eventCount).toBe(0);
    expect(controller.getSnapshot().online?.spectating).toBe(true);

    socket().receive({ type: 'room', room: next });
    expect(controller.getSnapshot().online?.spectating).toBe(false);
  });

  it('ignores anything that does not match the protocol', () => {
    const { socket, controller } = setup();
    socket().onopen?.();
    socket().onmessage?.({ data: '{"type":"view","view":{}}' });
    socket().onmessage?.({ data: 'garbage' });
    expect(controller.getOnline().game).toBeNull();
  });
});
