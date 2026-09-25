import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    // In production one Worker serves the page and /api on the same origin
    // (docs/DEPLOY.md). In development, forward /api (and its WebSockets) to
    // `npm run dev:server` so the client never needs to know where the server is.
    proxy: {
      '/api': { target: 'http://localhost:8787', ws: true },
    },
  },
});
