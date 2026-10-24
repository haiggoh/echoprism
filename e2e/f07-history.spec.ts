import { expect, test } from '@playwright/test';

/**
 * Live-test pass 2: history records every actual playback start. The
 * engine-test asserts the record CALL; this spec asserts the USER-visible
 * end: play a video, open History, the entry is there with the episode.
 * (The mock world seeds no plays — the row proves the recording path.)
 */
test('F07-H1: playing media lands in History', async ({ page }) => {
  await page.goto('/feed');
  await page.getByText('How Invidious pools actually work').click();
  await expect(page).toHaveURL(/\/player\//, { timeout: 10_000 });
  await page.waitForTimeout(1000); // the resolve completes → history row

  // Navigate IN-APP (a page.goto would reload and reset the mock world's
  // in-memory state, losing the row this test exists to prove).
  await page.getByRole('link', { name: 'History' }).click();
  await expect(page.getByRole('heading', { name: /^History$/ })).toBeVisible();
  await expect(page.getByText(/How Invidious pools actually work/)).toBeVisible({ timeout: 10_000 });
});
