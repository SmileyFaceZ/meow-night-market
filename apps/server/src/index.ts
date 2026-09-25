import { ROOM_CODE_ALPHABET, ROOM_CODE_LENGTH, roomCodeSchema } from '@meow/protocol';

export { GameRoom } from './room.ts';

// Worker entry (docs/MULTIPLAYER.md):
//   POST /api/rooms           → { code }  a new room
//   GET  /api/rooms/:code/ws  → WebSocket into that room's Durable Object
//   GET  /api/health          → ok

const CREATE_ATTEMPTS = 20;

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    if (origin !== null && !originAllowed(origin, env.ALLOWED_ORIGINS)) {
      return new Response('origin not allowed', { status: 403 });
    }
    const cors = corsHeaders(origin);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });

    if (url.pathname === '/api/health') return new Response('ok', { headers: cors });

    if (url.pathname === '/api/rooms' && request.method === 'POST') {
      for (let attempt = 0; attempt < CREATE_ATTEMPTS; attempt++) {
        const code = randomCode();
        if (await env.ROOMS.getByName(code).create(code))
          return Response.json({ code }, { headers: cors });
      }
      return new Response('no free room code', { status: 503, headers: cors });
    }

    const match = /^\/api\/rooms\/([^/]+)\/ws$/.exec(url.pathname);
    if (match) {
      const code = roomCodeSchema.safeParse(match[1]?.toUpperCase());
      if (!code.success) return new Response('bad room code', { status: 400, headers: cors });
      if (request.headers.get('Upgrade') !== 'websocket') {
        return new Response('expected a WebSocket', { status: 426, headers: cors });
      }
      return env.ROOMS.getByName(code.data).fetch(request);
    }

    return new Response('not found', { status: 404, headers: cors });
  },
} satisfies ExportedHandler<Env>;

function randomCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(ROOM_CODE_LENGTH));
  return Array.from(bytes, (b) => ROOM_CODE_ALPHABET[b % ROOM_CODE_ALPHABET.length]).join('');
}

export function originAllowed(origin: string, allowed: string): boolean {
  const list = allowed.split(',').map((o) => o.trim());
  return list.includes('*') || list.includes(origin);
}

function corsHeaders(origin: string | null): HeadersInit {
  return origin
    ? {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        Vary: 'Origin',
      }
    : {};
}
