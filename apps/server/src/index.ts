import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, roomCodeSchema } from '@meow/protocol';

export { GameRoom } from './room.ts';

// Worker entry (docs/MULTIPLAYER.md). Only /api/* reaches this code; the web client itself
// is served from static assets on the same origin (wrangler.jsonc › assets), so no CORS.
//   POST /api/rooms           → { code }  a new room
//   GET  /api/rooms/:code/ws  → WebSocket into that room's Durable Object
//   GET  /api/health          → ok

const CREATE_ATTEMPTS = 20;

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/api/health') return new Response('ok');

    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      for (let attempt = 0; attempt < CREATE_ATTEMPTS; attempt++) {
        const code = randomCode();
        if (await env.ROOMS.getByName(code).create(code)) return Response.json({ code });
      }
      return new Response('no free room code', { status: 503 });
    }

    const match = /^\/api\/rooms\/([^/]+)\/ws$/.exec(url.pathname);
    if (match) {
      const code = roomCodeSchema.safeParse(match[1]?.toUpperCase());
      if (!code.success) return new Response('bad room code', { status: 400 });
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('expected a WebSocket', { status: 426 });
      }
      return env.ROOMS.getByName(code.data).fetch(request);
    }

    return new Response('not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ROOM_CODE_LENGTH));
  return Array.from(bytes, (b) => ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length]).join('');
}
