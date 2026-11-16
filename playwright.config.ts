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
    // Phase B: the app's 'system' theme now follows the OS preference, and
    // headless Chromium prefers LIGHT — this suite was authored against the
    // dark brand (the focus-ring spec asserts #10F0A8). Pin the emulated
    // scheme to dark for determinism; theme-light.spec.ts covers the light
    // palette explicitly (axe + class assertions).
    colorScheme: 'dark',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:1420',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
  projects: [
    {
      name: 'chromium',
      use: {
        browserName: 'chromium',
        // The engine's play() is called from effect/promise context detached
        // from the click gesture, so headless chromium's autoplay policy
        // would reject it and the stream resolve effect (gated on isPlaying)
        // would never fire. Chromium-only flag — WebKit does not read it.
        launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] },
      },
    },
    // Task 1 (docs/plans/2026-11-16-followups-plan.md): WebKit is the engine
    // the shipped app actually runs on (Tauri WKWebView) and the only bundled
    // browser that plays HLS natively — the HLS specs are webkit-only.
    { name: 'webkit', use: { browserName: 'webkit' } },
  ],
});
