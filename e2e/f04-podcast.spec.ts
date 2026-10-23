import { expect, test } from '@playwright/test';

/**
 * F04-H1 (replica/test-plan.md): Play Podcast — the headless-testable subset:
 * podcast card click → player route → audio stream resolved into the hidden
 * engine <audio> element (PlayerProvider).
 *
 * Deviation from the plan text: mini-player expansion, chapter seek, background
 * audio and Bluetooth behaviors are OS/device-bound or not yet built — they
 * stay real-shell/owner verifications. The mock serves the fixture wav.
 */
test('F04-H1 (subset): clicking a podcast card resolves its audio stream', async ({ page }) => {
  await page.goto('/feed');

  await page.getByText('RSS is winning again').click();
  await expect(page).toHaveURL(/\/player\/ep-pod-1$/);

  // PlayerProvider renders one hidden <audio>; the resolve effect fills its src.
  const audio = page.locator('audio');
  await expect(audio).toHaveCount(1);
  await expect(audio).toHaveAttribute('src', /\/mock-media\/ep-pod-1\.wav$/, { timeout: 10_000 });

  // The episode title is visible on the player screen. Assert the player's
  // own heading: the mini player shows the same title text, so a bare
  // getByText is ambiguous (strict-mode violation) — and the heading role is
  // the element this assertion actually cares about (2c added it).
  await expect(page.getByRole('heading', { name: /RSS is winning again/ })).toBeVisible();
});

/**
 * F04-H2 (2e): the iTunes podcast directory is reachable from the Search
 * screen — a submitted term shows directory cards, and subscribing lists
 * that feed's episodes inline. The mock router mirrors the Rust contract
 * (subscribe persists channel + episodes; unknown feeds reject), so this
 * exercises the real UI flow; the LIVE backend check is the cargo smoke
 * (podcast/mod.rs, #[ignore]) and the in-app live run stays owner-verify.
 * Playback is deliberately NOT asserted here: real-backend podcast playback
 * is a recorded defect (stream_episode never consults audio_url — 2e plan).
 */
test('F04-H2 (2e): search shows the podcast directory and subscribing lists its episodes', async ({ page }) => {
  await page.goto('/search');

  await page.getByLabel('Search videos, podcasts, channels').fill('signal');
  await page.getByRole('button', { name: /^search$/i }).click();

  // The directory section renders on the default 'all' filter, below the
  // local results grid.
  const directory = page.getByRole('heading', { name: /podcast directory/i });
  await expect(directory).toBeVisible();
  await expect(page.getByText('The Weekly Signal')).toBeVisible();

  await page.getByRole('button', { name: /subscribe to the weekly signal/i }).click();

  await expect(page.getByRole('button', { name: /subscribed to the weekly signal/i })).toBeVisible();
  await expect(
    page.getByText(/Episode 118: The instance reliability problem, revisited/),
  ).toBeVisible();
  await expect(page.getByText(/Episode 117: Why RSS outlived every aggregator/)).toBeVisible();
});

/**
 * F04-H3 (Phase A): a subscribed episode PLAYS — end to end through the
 * real card-click chain. In the real shell this was the recorded blocker
 * (`podcast-episodes-cannot-play`): stream_episode ignored the enclosure
 * and handed yt-dlp an RSS guid. The Rust enclosure path + its mock mirror
 * make the subscribe→play flow resolvable in both worlds; this asserts the
 * engine's hidden <audio> receives the enclosure URL (the mock's
 * generic-audio.wav), not an error toast.
 */
test('F04-H3 (Phase A): subscribing then clicking an episode resolves its enclosure', async ({ page }) => {
  await page.goto('/search');
  await page.getByLabel('Search videos, podcasts, channels').fill('signal');
  await page.getByRole('button', { name: /^search$/i }).click();
  await page.getByRole('button', { name: /subscribe to the weekly signal/i }).click();
  await page
    .getByTestId('directory-episode-row')
    .filter({ hasText: /Episode 117/ })
    .click();

  await expect(page).toHaveURL(/\/player\//, { timeout: 10_000 });
  const audio = page.locator('audio');
  await expect(audio).toHaveCount(1);
  await expect(audio).toHaveAttribute('src', /\/mock-media\/generic-audio\.wav$/, {
    timeout: 10_000,
  });
});
