import { expect, test } from '@playwright/test';

/**
 * F03-H1 (replica/test-plan.md): Play Video — the headless-testable subset:
 * feed card click (D2 'auto': nothing playing → play now) → player route →
 * the engine resolves the stream and wires it to the video element.
 *
 * Deviation from the plan text: fullscreen S14, controls-hover and Esc
 * behaviors are not asserted here (player chrome is still minimal). The mock
 * serves a 2-second VP8 webm because headless chromium cannot decode H.264 —
 * this spec verifies stream resolution and element wiring, not codecs.
 */
test('F03-H1 (subset): clicking a video card plays it in the player', async ({ page }) => {
  await page.goto('/feed');

  await page.getByText('How Invidious pools actually work').click();
  await expect(page).toHaveURL(/\/player\/ep-video-1$/);

  // The unified resolve effect (PlayerProvider) requests stream_episode and
  // sets the resolved URL as the video src. (PlayerScreen's video element has
  // no controls attribute — playback chrome is custom.)
  const video = page.locator('video');
  await expect(video).toBeVisible();
  await expect(video).toHaveAttribute('src', /\/mock-media\/ep-video-1\.webm$/, { timeout: 10_000 });

  // D2 'auto' + nothing playing => play now: the engine started playback.
  await expect
    .poll(async () => await video.evaluate((el) => (el as HTMLVideoElement).paused), { timeout: 10_000 })
    .toBe(false);
});
