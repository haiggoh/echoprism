import { expect, test } from '@playwright/test';

/**
 * F08 (dead-controls plan Phase 4 discriminant): save a queue of 2 as a
 * playlist, the playlist is listed, and replaying fills the queue in the
 * ORIGINAL order and starts the first item — an order-losing implementation
 * must fail the final two assertions.
 *
 * In-app navigation only throughout: the queue is in-memory Zustand state,
 * a full page load would reset it.
 */
test('F08: save queue as playlist → listed → replay fills the queue in order', async ({ page }) => {
  // Round 10: seed add-to-END through the real Settings flow (the card's
  // aria-label stays 'Add to end'; the default is now 'Play next').
  await page.goto('/settings');
  await page.getByText('Add to End', { exact: true }).click();
  await page.goto('/feed');

  const firstCard = page.locator('article', { hasText: 'How Invidious pools actually work' }).first();
  const secondCard = page.locator('article', { hasText: 'Big Buck Bunny' }).first();
  await firstCard.getByRole('button', { name: 'Add to end' }).click();
  await expect(page.getByText('Added to end of queue')).toBeVisible();
  await secondCard.getByRole('button', { name: 'Add to end' }).click();

  await page.getByRole('link', { name: 'Queue' }).click();
  await expect(page).toHaveURL(/\/queue$/);
  await page.getByRole('button', { name: 'Save as playlist' }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Playlist name').fill('Road mix');
  await dialog.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByText('Playlist saved')).toBeVisible();

  await page.getByRole('link', { name: 'Playlists' }).click();
  await expect(page).toHaveURL(/\/playlists$/);
  await expect(page.getByTestId('playlist-row')).toHaveCount(1);
  // Scoped to the row: the save toast also quotes the name.
  await expect(page.getByTestId('playlist-row').getByText('Road mix')).toBeVisible();

  // Replay: queue refilled in the saved order, playback started on item 1.
  await page.getByRole('button', { name: 'Play playlist Road mix' }).click();
  await expect(page).toHaveURL(/\/player\//);
  await page.getByRole('link', { name: 'Queue' }).click();
  const items = page.locator('article');
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText('How Invidious pools actually work');
  await expect(items.nth(1)).toContainText('Big Buck Bunny');
});
