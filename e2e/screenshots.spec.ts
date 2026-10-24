import { test, expect } from '@playwright/test';
import path from 'node:path';

/**
 * 4h: deterministic launch screenshots, captured from the mock-world dev
 * server (the real UI against fixture data) into docs/screenshots/. Run:
 *   npx playwright test e2e/screenshots.spec.ts
 * Every image is the REAL app — no mockups of unbuilt UI.
 */
// Playwright runs from the repo root (its own webServer cwd).
const outDir = path.resolve(process.cwd(), 'docs', 'screenshots');

// A capture UTILITY, not a gate: it must not run uninvited (a plain suite
// pass would overwrite the committed screenshots with binary-differing
// re-renders). Opt in explicitly: CAPTURE_SCREENSHOTS=1 npx playwright test e2e/screenshots.spec.ts
test.skip(process.env.CAPTURE_SCREENSHOTS !== '1', 'capture utility — run with CAPTURE_SCREENSHOTS=1');

async function settle(page: import('@playwright/test').Page) {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(400);
}

for (const [name, route] of [
  ['feed', '/feed'],
  ['search', '/search'],
  ['queue', '/queue'],
  ['channels', '/channels'],
  ['smart-links', '/smart-links'],
  ['settings', '/settings'],
] as const) {
  test(`capture ${name}`, async ({ page }) => {
    await page.goto(route);
    await settle(page);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.screenshot({ path: path.join(outDir, `${name}.png`), fullPage: false });
  });
}

test('capture search with directory results', async ({ page }) => {
  await page.goto('/search');
  await page.getByLabel('Search videos, podcasts, channels').fill('signal');
  await page.getByRole('button', { name: /^search$/i }).click();
  await page.waitForLoadState('networkidle');
  await page.getByRole('heading', { name: /podcast directory/i }).waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, 'search-directory.png'), fullPage: false });
});

test('capture the player', async ({ page }) => {
  await page.goto('/feed');
  await page.getByText('RSS is winning again').click();
  await page.waitForURL(/\/player\//);
  await page.waitForTimeout(1200);
  await page.screenshot({ path: path.join(outDir, 'player.png'), fullPage: false });
});
