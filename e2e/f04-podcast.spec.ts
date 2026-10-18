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

  // The episode title is visible on the player screen.
  await expect(page.getByText('RSS is winning again')).toBeVisible();
});
