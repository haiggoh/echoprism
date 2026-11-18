import { expect, test } from '@playwright/test';

/**
 * F02-H1 (replica/test-plan.md): Discover & Subscribe — the headless-testable
 * subset: /search → type query → submit → results render.
 *
 * Deviation from the plan text: steps 3-5 (channel page S06, subscribe button)
 * have no UI wiring yet — no screen calls channelCommands.subscribe and there
 * is no channel-detail route. Recorded as a gap; this spec covers search only.
 * The header search input used to be a dead control (no handler) — it now
 * submits to /search?q= (covered by F02-H2 below); the real surface is the
 * /search route.
 */
test('F02-H1 (subset): search returns matching episodes', async ({ page }) => {
  await page.goto('/search');

  await expect(page.getByText('Enter a search query to find videos and podcasts')).toBeVisible();

  // The header carries a dead search input with the same placeholder — scope
  // to the SearchScreen form.
  const input = page.locator('form').getByPlaceholder('Search videos, podcasts, channels...');
  // The submit button stays disabled under the 2-char minimum.
  await input.fill('R');
  await expect(page.getByRole('button', { name: 'Search' })).toBeDisabled();

  await input.fill('Invidious');
  await page.getByRole('button', { name: 'Search' }).click();

  // search_episodes matches on title substring.
  await expect(page.getByText('How Invidious pools actually work')).toBeVisible();
  // A non-matching fixture title stays out of the results.
  await expect(page.getByText('RSS is winning again')).toHaveCount(0);
});

test('F02-H2: the feed header search box submits to /search?q= (was an inert control)', async ({ page }) => {
  await page.goto('/feed');
  const headerInput = page.getByPlaceholder('Search feed...');
  await headerInput.fill('Invidious');
  await headerInput.press('Enter');
  // The header box hands the query to the real search surface — SearchScreen
  // prefills and runs from ?q=.
  await expect(page).toHaveURL(/\/search\?q=Invidious/);
  await expect(page.getByText('How Invidious pools actually work')).toBeVisible();
  await expect(page.getByText('RSS is winning again')).toHaveCount(0);
});
