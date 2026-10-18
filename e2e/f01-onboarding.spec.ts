import { expect, test } from '@playwright/test';

/**
 * F01-H1 (replica/test-plan.md): First Run Setup, 4 steps.
 * 1. Get Started → 2. Add Instance (valid URL) → 3. Skip for now → 4. Open Feed.
 * F01-E1 is asserted on the way: "Add Instance" is disabled while the URL
 * input is empty.
 *
 * Deviation from the plan text: the plan expects an empty feed state at the
 * end; in browser mode the mock router serves the 4-episode fixture feed, so
 * the final assertion is "lands on Feed with content", not "empty state".
 * The empty-feed path stays a real-shell (seeded-fresh-DB) verification.
 */
test('F01-H1: onboarding 4 steps land on the feed', async ({ page }) => {
  await page.goto('/onboarding');

  // Step 1: welcome
  await expect(page.getByRole('heading', { name: 'EchoPrism' })).toBeVisible();
  await page.getByRole('button', { name: 'Get Started' }).click();

  // Step 2: add instance — F01-E1 disabled while empty
  await expect(page.getByRole('heading', { name: 'Add Your First Instance' })).toBeVisible();
  const addInstance = page.getByRole('button', { name: 'Add Instance' });
  await expect(addInstance).toBeDisabled();
  await page.getByLabel('Instance URL').fill('https://invidious.example.dev');
  await expect(addInstance).toBeEnabled();
  await addInstance.click();

  // Step 3: import subscriptions — skip
  await expect(page.getByRole('heading', { name: 'Import Subscriptions' })).toBeVisible();
  await page.getByRole('button', { name: 'Skip for now' }).click();

  // Step 4: done → open feed
  await expect(page.getByRole('heading', { name: "You're All Set!" })).toBeVisible();
  await page.getByRole('button', { name: 'Open Feed' }).click();

  await expect(page).toHaveURL(/\/feed$/);
  await expect(page.getByRole('heading', { name: 'Feed', exact: true })).toBeVisible();
  // Mock feed content rendered (see deviation note above).
  await expect(page.getByText('How Invidious pools actually work')).toBeVisible();
});
