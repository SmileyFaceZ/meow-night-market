import { DurableObject } from 'cloudflare:workers';
import type { ServerMessage } from '@meow/protocol';
import { alarmTime, type Conn, newRoom, RoomCore, type StoredRoom } from './core.ts';

/** What a connection remembers across hibernation (≤ 16 KB). */
interface Attachment {
  readonly id: string;
  seatId: string | null;
}

const STORAGE_KEY = 'room';
/** Keep-alive pings are answered without waking the room. */
const PING = JSON.stringify({ type: 'ping' });
const PONG = JSON.stringify({ type: 'pong' });

/**
 * One online room = one Durable Object (docs/MULTIPLAYER.md). Uses the WebSocket
 * Hibernation API, so an idle room costs nothing while players stay connected.
 * All game logic lives in RoomCore; this class only connects it to Cloudflare.
 */
export class GameRoom extends DurableObject<Env> {
  private core: RoomCore | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair(PING, PONG));
    // Runs again after every wake-up: reload the room before handling anything.
    void ctx.blockConcurrencyWhile(async () => {
      const stored = await ctx.storage.get<StoredRoom>(STORAGE_KEY);
      if (stored) this.core = this.makeCore(stored);
    });
  }

  /** Called by the Worker when it hands out a new code. False if the code is taken. */
  async create(code: string): Promise<boolean> {
    if (this.core) return false;
    this.core = this.makeCore(newRoom(code, Date.now()));
    await this.save();
    return true;
  }

  override async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade') !== 'websocket') {
      return new Response('expected a WebSocket', { status: 426 });
    }
    const [client, server] = Object.values(new WebSocketPair()) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    const attachment: Attachment = { id: crypto.randomUUID(), seatId: null };
    server.serializeAttachment(attachment);
    if (!this.core) {
      send(server, { type: 'error', key: 'room.error.notFound' });
      server.close(4004, 'no such room');
    } else {
      this.core.handleOpen();
      await this.save();
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  override async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (!this.core) return;
    this.core.handleMessage(this.conn(ws), message);
    await this.save();
  }

  override async webSocketClose(ws: WebSocket): Promise<void> {
    if (!this.core) return;
    this.core.handleClose(this.conn(ws));
    await this.save();
  }

  override async webSocketError(ws: WebSocket): Promise<void> {
    await this.webSocketClose(ws);
  }

  override async alarm(): Promise<void> {
    if (!this.core) return;
    this.core.handleAlarm();
    if (this.core.expired) {
      // Nobody came back (or nobody asked for another game) for long enough: forget the
      // room, its code becomes free. Anyone still connected is told it is gone.
      this.core = null;
      for (const ws of this.ctx.getWebSockets()) {
        send(ws, { type: 'error', key: 'room.error.notFound' });
        try {
          ws.close(4004, 'room expired');
        } catch {
          // already closed
        }
      }
      await this.ctx.storage.deleteAlarm();
      await this.ctx.storage.deleteAll();
      return;
    }
    await this.save();
  }

  private makeCore(stored: StoredRoom): RoomCore {
    return new RoomCore(stored, {
      now: () => Date.now(),
      random: () => crypto.getRandomValues(new Uint32Array(1))[0]! / 2 ** 32,
      token: () => newToken(),
      conns: () => this.ctx.getWebSockets().map((ws) => this.conn(ws)),
      warn: (event, data) => console.warn(JSON.stringify({ warn: event, ...data })),
    });
  }

  private conn(ws: WebSocket): Conn {
    const attachment = ws.deserializeAttachment() as Attachment;
    return {
      id: attachment.id,
      get seatId() {
        return (ws.deserializeAttachment() as Attachment).seatId;
      },
      set seatId(seatId) {
        ws.serializeAttachment({ ...(ws.deserializeAttachment() as Attachment), seatId });
      },
      send: (message) => send(ws, message),
      close: (code, reason) => {
        try {
          ws.close(code, reason);
        } catch {
          // already closing
        }
      },
    };
  }

  /**
   * Persist the room if it changed, and make sure we wake up for whatever is due next
   * (alarmTime: never deleted, only moved earlier, always strictly in the future —
   * docs/DEPLOY.md › โควตาแพ็กเกจฟรี). Inside alarm() getAlarm() is null, so the next
   * alarm is always set there.
   */
  private async save(): Promise<void> {
    if (!this.core) return;
    if (this.core.takeChanged()) await this.ctx.storage.put(STORAGE_KEY, this.core.state);
    const wake = this.core.nextWake();
    if (wake === null) return;
    const at = alarmTime(wake, await this.ctx.storage.getAlarm(), Date.now());
    if (at !== null) await this.ctx.storage.setAlarm(at);
  }
}

function send(ws: WebSocket, message: ServerMessage): void {
  try {
    ws.send(JSON.stringify(message));
  } catch {
    // The socket closed meanwhile; the close handler will catch up.
  }
}

function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  return btoa(String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replaceAll('=', '');
}
