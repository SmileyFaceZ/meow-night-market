import { cloudflareTest } from '@cloudflare/vitest-plugin';
import { defineConfig } from 'vitest/config';

// Server tests run inside workerd (the real Workers runtime) via Miniflare.
export default defineConfig({
  plugins: [cloudflareTest({ wrangler: { configPath: './wrangler.jsonc' } })],
  test: {
    name: 'server',
    include: ['test/**/*.test.ts'],
  },
});
