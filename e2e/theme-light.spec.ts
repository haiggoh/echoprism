import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

/**
 * Phase B (light theme): the main suite runs pinned to the dark scheme it
 * was authored against (the brand focus-ring spec asserts #10F0A8); this
 * spec covers the light palette EXPLICITLY — the class applies, and the
 * core screens carry no critical/serious axe violations under light. The
 * palette's numeric contrast pairs are asserted in
 * src/__tests__/light-theme-contrast.test.ts; this is the rendered end of
 * the same guarantee.
 */
async function criticalSeriousCount(page: import('@playwright/test').Page): Promise<number> {
  const results = await new AxeBuilder({ page }).analyze();
  const serious = results.violations.filter((v) => v.impact === 'critical' || v.impact === 'serious');
  if (serious.length > 0) {
    const summary = serious
      .map((v) => `${v.id}(${v.impact}): ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`)
      .join('; ');
    throw new Error(`axe violations under LIGHT theme — ${summary}`);
  }
  return 0;
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('theme', 'light');
    } catch {
      /* storage unavailable — the class assertions below would fail loudly */
    }
  });
});

test('light theme applies the palette class', async ({ page }) => {
  await page.goto('/feed');
  await expect(page.getByRole('heading', { name: 'Feed', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.classList.contains('light'))).toBe(true);
});

for (const route of ['/feed', '/search', '/settings']) {
  test(`axe (light): no critical/serious violations on ${route}`, async ({ page }) => {
    await page.goto(route);
    await page.waitForLoadState('networkidle');
    expect(await criticalSeriousCount(page)).toBe(0);
  });
}
