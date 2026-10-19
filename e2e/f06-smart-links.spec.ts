import { expect, test } from '@playwright/test';

/**
 * F06 + D6/D7 (replica/test-plan.md, design-decisions.md) — the headless
 * two-stream user story: one show, two title families, linked at search time
 * and played through its per-title-family default.
 *
 * The search for "More News" must surface BOTH families of the D6 canonical
 * show, each card carrying the smart-link badge; the Some More News card then
 * plays VIDEO and the Even More News card plays AUDIO (D7 seeded rules:
 * ch-3 "Some More News" → video, ch-4 "Even More News" → audio).
 *
 * Deviations from the plan text: /search keeps its query in component state,
 so navigating back loses results — the spec re-searches after returning.
 * And because D2 'auto' queues a card click while something is playing, the
 * spec pauses on the player screen before going back (the click must happen
 * with nothing playing to reach the play-now path at all).
 */
test('F06-H1 (subset): both families linked at search; each plays its D7 default', async ({ page }) => {
  await page.goto('/search');

  const input = page.locator('form').getByPlaceholder('Search videos, podcasts, channels...');
  await input.fill('More News');
  await page.getByRole('button', { name: 'Search' }).click();

  // D6: both title families of the two-stream show arrive in one search.
  const smnCard = page.locator('article', { hasText: 'Some More News: Why Billionaires Should Not Exist' });
  const emnCard = page.locator('article', { hasText: 'Even More News: Why Billionaires Should Not Exist' });
  await expect(smnCard).toBeVisible();
  await expect(emnCard).toBeVisible();

  // D6: search-time link resolution marks the cards with the smart-link badge.
  await expect(smnCard.getByText('Link')).toBeVisible();
  await expect(emnCard.getByText('Link')).toBeVisible();

  // D7: the SMN-titled episode plays VIDEO (seeded rule ch-3 → video; D2
  // 'auto' + nothing playing → play now).
  await smnCard.click();
  await expect(page).toHaveURL(/\/player\/ep-smn-1$/);
  const video = page.locator('video');
  await expect(video).toHaveAttribute('src', /\/mock-media\/ep-smn-1\.webm$/, { timeout: 10_000 });
  await expect
    .poll(async () => await video.evaluate((el) => (el as HTMLVideoElement).paused), { timeout: 10_000 })
    .toBe(false);

  // Pause before going back: with playback running, D2 'auto' would QUEUE the
  // next click instead of playing it. Two Pause buttons exist (player screen
  // + mini-player) — both drive the same engine toggle.
  await page.getByRole('button', { name: 'Pause' }).first().click();
  await page.goBack();

  // Results live in component state — re-run the search.
  const input2 = page.locator('form').getByPlaceholder('Search videos, podcasts, channels...');
  await input2.fill('More News');
  await page.getByRole('button', { name: 'Search' }).click();
  await expect(
    page.locator('article', { hasText: 'Even More News: Why Billionaires Should Not Exist' })
  ).toBeVisible();

  // D7: the EMN-titled episode plays AUDIO (seeded rule ch-4 → audio) through
  // the engine's hidden <audio> element.
  await page
    .locator('article', { hasText: 'Even More News: Why Billionaires Should Not Exist' })
    .click();
  await expect(page).toHaveURL(/\/player\/ep-emn-1$/);
  const audio = page.locator('audio');
  await expect(audio).toHaveAttribute('src', /\/mock-media\/ep-emn-1\.wav$/, { timeout: 10_000 });
});
