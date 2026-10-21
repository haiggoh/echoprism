import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Accessibility scans (plan phase 4): axe on the three core screens. The gate
 * is critical+serious = 0; other severities are reported to the owner as
 * findings rather than blocking, since this is an early UI build.
 */
async function criticalSeriousCount(page: import('@playwright/test').Page): Promise<number> {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  if (serious.length > 0) {
    // Fail with the rule ids + sample targets so the findings are actionable.
    const summary = serious
      .map((v) => `${v.id}(${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)
      .join('; ');
    throw new Error(`axe violations — ${summary}`);
  }
  return 0;
}

test('axe: no critical/serious violations on feed, settings, player', async ({ page }) => {
  await page.goto('/feed');
  await expect(page.getByRole('heading', { name: 'Feed', exact: true })).toBeVisible();
  expect(await criticalSeriousCount(page)).toBe(0);

  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  expect(await criticalSeriousCount(page)).toBe(0);

  await page.goto('/feed');
  await page.getByText('How Invidious pools actually work').click();
  await expect(page).toHaveURL(/\/player\/ep-video-1$/);
  await expect(page.locator('video')).toBeVisible();
  expect(await criticalSeriousCount(page)).toBe(0);
});

/**
 * 2b: every route, not just the three core screens — an unscanned screen is
 * an unaudited surface. Each route asserts its own heading first so a broken
 * route fails loudly instead of scanning a redirect.
 */
const ROUTES: Array<{ path: string; heading: RegExp }> = [
  { path: '/feed', heading: /^Feed$/ },
  { path: '/queue', heading: /^Queue$/ },
  { path: '/search', heading: /^Search$/ },
  { path: '/history', heading: /^History$/ },
  { path: '/downloads', heading: /^Downloads$/ },
  { path: '/channels', heading: /^Channels$/ },
  { path: '/smart-links', heading: /^Smart Links$/ },
];

for (const route of ROUTES) {
  test(`axe: no critical/serious violations on ${route.path}`, async ({ page }) => {
    await page.goto(route.path);
    await expect(page.getByRole('heading', { name: route.heading }).first()).toBeVisible();
    expect(await criticalSeriousCount(page)).toBe(0);
  });
}

/**
 * 2b: every Settings tab is its own surface — the original scan only saw the
 * default tab, which is how an inert theme control and the instance badges
 * went unaudited for so long.
 */
const SETTINGS_TABS = ['Instances', 'Preferences', 'Podcasts', 'Smart Links', 'Play Modes', 'Shortcuts', 'About'];

for (const tab of SETTINGS_TABS) {
  test(`axe: no critical/serious violations on Settings > ${tab}`, async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('tab', { name: tab }).click();
    await expect(page.getByRole('tab', { name: tab })).toHaveAttribute('aria-selected', 'true');
    expect(await criticalSeriousCount(page)).toBe(0);
  });
}
