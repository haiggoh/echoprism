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

/**
 * Phase E: the hover preview — hovering a card's thumbnail for the delay
 * shows the storyboard sprite overlay (the mock serves a 2×2 sprite), and
 * leaving destroys it. The unplug switch and cost bounds are asserted in
 * vitest (hover-preview.test.tsx); this is the rendered end.
 */
test('F03-E1 (Phase E): hovering a card shows the storyboard preview, leaving hides it', async ({ page }) => {
  await page.goto('/feed');
  await expect(page.getByRole('heading', { name: 'Feed', exact: true })).toBeVisible();

  const thumb = page.locator('article .aspect-video').first();
  await thumb.hover();
  const preview = page.getByTestId('episode-preview');
  await expect(preview).toBeVisible({ timeout: 3_000 });
  // aria-hidden: the preview is an enhancement, invisible to the a11y tree.
  await expect(preview).toHaveAttribute('aria-hidden', 'true');

  await page.mouse.move(0, 0);
  await expect(preview).toBeHidden();
});
