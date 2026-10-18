import { expect, test } from '@playwright/test';

/**
 * F05-H1 (replica/test-plan.md): Queue Management — add from feed cards,
 * reorder by drag, remove, clear.
 *
 * Deviation from the plan text: the plan's step 1 is "drag episode to queue"
 * (feed → queue drag); the built affordance is per-card queue buttons
 * ("Add to end" / "Play next" with toasts) — F05-E2's drag-from-feed stays
 * unbuilt and is not asserted. Reorder uses the queue's HTML5 drag handle.
 */
test('F05-H1: add from feed, reorder, remove, clear', async ({ page }) => {
  await page.goto('/feed');

  const firstCard = page.locator('article', { hasText: 'How Invidious pools actually work' }).first();
  const secondCard = page.locator('article', { hasText: 'Big Buck Bunny' }).first();

  // Add two episodes to the end of the queue; each confirms with a toast.
  await firstCard.getByRole('button', { name: 'Add to end' }).click();
  await expect(page.getByText('Added to end of queue')).toBeVisible();
  await secondCard.getByRole('button', { name: 'Add to end' }).click();

  // Client-side navigation only: the queue lives in an in-memory Zustand
  // store (D4 local-first), so a full page load would reset it.
  await page.getByRole('link', { name: 'Queue' }).click();
  await expect(page).toHaveURL(/\/queue$/);
  // QueueItemComponent's root is the only <article> on the queue screen. A
  // name-prefix locator ("Play ...") double-counts: each item root AND its
  // nested "Play next" button both match (measured 4 for 2 items).
  const items = page.locator('article');
  await expect(items).toHaveCount(2);
  await expect(items.nth(0)).toContainText('How Invidious pools actually work');
  await expect(items.nth(1)).toContainText('Big Buck Bunny');

  // Reorder: drag the first item's handle onto the second item.
  const firstItem = items.nth(0);
  const secondItem = items.nth(1);
  await firstItem
    .getByLabel('Drag to reorder')
    .dragTo(secondItem);
  await expect(items.nth(0)).toContainText('Big Buck Bunny');
  await expect(items.nth(1)).toContainText('How Invidious pools actually work');

  // Remove one item.
  await items.nth(1).getByRole('button', { name: 'Remove from queue' }).click();
  await expect(items).toHaveCount(1);
  await expect(items.nth(0)).toContainText('Big Buck Bunny');

  // Clear the rest → empty state.
  await page.getByRole('button', { name: 'Clear queue' }).click();
  await expect(items).toHaveCount(0);
});
