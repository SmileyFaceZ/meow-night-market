import {
  type ServerMessage,
  serverMessageSchema,
  parseMessage,
  ROOM_CODE_PATTERN,
} from '@meow/protocol';
import { env, exports } from 'cloudflare:workers';
import { evictDurableObject, runDurableObjectAlarm } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';

async function createRoom(): Promise<string> {
  const response = await exports.default.fetch('http://room.test/api/rooms', { method: 'POST' });
  expect(response.status).toBe(200);
  const { code } = await response.json<{ code: string }>();
  return code;
}

/** Opens a WebSocket into a room and collects what the server sends. */
async function join(code: string) {
  const response = await exports.default.fetch(`http://room.test/api/rooms/${code}/ws`, {
    headers: { Upgrade: 'websocket' },
  });
  expect(response.status).toBe(101);
  const ws = response.webSocket!;
  ws.accept();
  const inbox: ServerMessage[] = [];
  const waiters: (() => void)[] = [];
  ws.addEventListener('message', (event) => {
    const message = parseMessage(serverMessageSchema, event.data);
    expect(message, String(event.data)).not.toBeNull();
    inbox.push(message!);
    for (const wake of waiters.splice(0)) wake();
  });
  const next = async <T extends ServerMessage['type']>(type: T) => {
    for (let i = 0; i < 50; i++) {
      const found = inbox.find((m) => m.type === type);
      if (found) {
        inbox.splice(inbox.indexOf(found), 1);
        return found as Extract<ServerMessage, { type: T }>;
      }
      await new Promise<void>((resolve) => waiters.push(resolve));
    }
    throw new Error(`no ${type} message`);
  };
  const say = (message: unknown) => ws.send(JSON.stringify(message));
  return { ws, next, say };
}

describe('worker', () => {
  it('creates rooms with a readable code', async () => {
    const code = await createRoom();
    expect(code).toMatch(ROOM_CODE_PATTERN);
  });

  it('refuses unknown API paths and malformed room codes', async () => {
    const missing = await exports.default.fetch('http://room.test/api/nope');
    expect(missing.status).toBe(404);
    const badCode = await exports.default.fetch('http://room.test/api/rooms/0000/ws', {
      headers: { Upgrade: 'websocket' },
    });
    expect(badCode.status).toBe(400);
  });

  it('tells a client when the room does not exist', async () => {
    const client = await join('ZZZZ');
    expect((await client.next('error')).key).toBe('room.error.notFound');
  });

  it('plays over WebSockets and survives the room being evicted', async () => {
    const code = await createRoom();
    const ann = await join(code);
    ann.say({ type: 'hello', name: 'Ann', cat: 'calico' });
    const welcome = await ann.next('welcome');
    expect(welcome.seatId).toBe('p0');
    await ann.next('room');

    ann.say({ type: 'addBot', bot: { personality: 'greedy', difficulty: 'normal' } });
    expect((await ann.next('room')).room.seats).toHaveLength(2);
    ann.say({ type: 'start' });
    const first = await ann.next('view');
    expect(first.view.phase).toBe('bidding');
    expect(first.view.viewer).toBe('p0');

    // Everything must come back from storage after the object is torn down.
    const stub = env.ROOMS.getByName(code);
    await evictDurableObject(stub);
    ann.say({ type: 'action', action: { type: 'bid', playerId: 'p0', value: 3 } });
    const afterBid = await ann.next('view');
    expect(afterBid.view.yourBid).toBe(3);

    // The bot is due on an alarm; run it now instead of waiting.
    expect(await runDurableObjectAlarm(stub)).toBe(true);
    const revealed = await ann.next('view');
    expect(revealed.events.some((e) => e.type === 'BIDS_REVEALED')).toBe(true);
    ann.ws.close();
  });
});
