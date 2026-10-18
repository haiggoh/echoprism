import { defineConfig } from '@playwright/test';

/**
 * e2e harness (P3 phase 4, docs/plans/2026-10-18-p3-test-infrastructure.md).
 * Runs the vite dev server and drives the app in plain-browser mode, where
 * src/tauri-bridge.ts routes every invoke to the mock router — so specs
 * exercise real UI against fixture data, no Tauri shell required.
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: false,
  use: {
    baseURL: 'http://localhost:1420',
    trace: 'retain-on-failure',
    // The engine's play() is called from effect/promise context detached from
    // the click gesture, so headless chromium's autoplay policy would reject
    // it and the stream resolve effect (gated on isPlaying) would never fire.
    launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:1420',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
});
