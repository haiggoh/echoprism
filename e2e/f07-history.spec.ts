import { expect, test } from '@playwright/test';

/**
 * Live-test pass 2: history records every actual playback start. The
 * engine-test asserts the record CALL; this spec asserts the USER-visible
 * end: play a video, open History, the entry is there with the episode.
 *
 * 2026-10-31 review fix (waypoint review-2026-10-25-fixes): the old version
 * could be satisfied by a fixture row — the mock world seeds hist-1. The
 * spec now CLEARS history first and asserts the empty state, so the final
 * assertion can only be satisfied by a row THIS test's play created.
 */
test('F07-H1: playing media lands in History', async ({ page }) => {
  await page.goto('/feed');

  // Navigate IN-APP throughout (a page.goto would reload and reset the mock
  // world's in-memory state, losing the row this test exists to prove).
  await page.getByRole('link', { name: 'History' }).click();
  await expect(page.getByRole('heading', { name: /^History$/ })).toBeVisible();
  await page.getByRole('button', { name: /clear history/i }).click();
  await expect(page.getByText(/watch history will appear here/i)).toBeVisible();
  await expect(page.getByTestId('history-row')).toHaveCount(0);

  await page.getByRole('link', { name: 'Feed' }).click();
  await page.getByText('How Invidious pools actually work').click();
  await expect(page).toHaveURL(/\/player\//, { timeout: 10_000 });
  await page.waitForTimeout(1000); // the resolve completes → history row

  await page.getByRole('link', { name: 'History' }).click();
  await expect(page.getByRole('heading', { name: /^History$/ })).toBeVisible();
  // Exactly ONE row, and it is the episode just played — not a fixture row.
  // Scoped to the row: the mini player still shows the same title elsewhere.
  await expect(page.getByTestId('history-row')).toHaveCount(1, { timeout: 10_000 });
  await expect(page.getByTestId('history-row').getByText(/How Invidious pools actually work/)).toBeVisible();
});
