import { defineConfig } from '@playwright/test';

// End-to-end tests (docs/MULTIPLAYER.md › การพัฒนาในเครื่อง) against the production shape:
// `npm run preview` builds the client and runs the one Worker (static assets + /api) under
// wrangler dev, driven by two separate browser profiles.
// Locally this uses the installed Google Chrome (no browser download); set
// PW_BUNDLED_BROWSER=1 to use Playwright's own Chromium (`npx playwright install chromium`).
export default defineConfig({
  testDir: 'e2e',
  timeout: 240_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:8787',
    ...(process.env.PW_BUNDLED_BROWSER ? {} : { channel: 'chrome' }),
    viewport: { width: 390, height: 844 },
    reducedMotion: 'reduce',
    // Traces can be large; record them only when asked (PW_TRACE=1).
    trace: process.env.PW_TRACE ? 'retain-on-failure' : 'off',
  },
  webServer: {
    command: 'npm run preview',
    url: 'http://localhost:8787/api/health',
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
