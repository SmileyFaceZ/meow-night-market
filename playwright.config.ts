import { defineConfig } from '@playwright/test';

// End-to-end tests (docs/MULTIPLAYER.md › การพัฒนาในเครื่อง): the real Worker (wrangler dev)
// and the real web client (Vite), driven by two separate browser profiles.
// Locally this uses the installed Google Chrome (no browser download); set
// PW_BUNDLED_BROWSER=1 to use Playwright's own Chromium (`npx playwright install chromium`).
export default defineConfig({
  testDir: 'e2e',
  timeout: 240_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5173',
    ...(process.env.PW_BUNDLED_BROWSER ? {} : { channel: 'chrome' }),
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
    // Traces can be large; record them only when asked (PW_TRACE=1).
    trace: process.env.PW_TRACE ? 'retain-on-failure' : 'off',
  },
  webServer: [
    {
      command: 'npm run dev:server',
      url: 'http://localhost:8787/api/health',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      command: 'npm run dev',
      url: 'http://localhost:5173',
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
