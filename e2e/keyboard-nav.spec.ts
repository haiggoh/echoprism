import { test, expect } from '@playwright/test';

/**
 * 2b: keyboard reachability. axe cannot see tab order or focus visibility,
 * so these are the missing half of the accessibility gate: every Tab stop
 * must land on something interactive, and the global :focus-visible ring
 * (src/index.css) must actually paint.
 */

const INTERACTIVE_ROLES = [
  'link',
  'button',
  'tab',
  'searchbox',
  'textbox',
  'checkbox',
  'radio',
  'combobox',
];

test('Tab traverses interactive controls only, and focus is visibly indicated', async ({ page, browserName }) => {
  // Scoped to chromium (plan §6 Task 1 rule: never silently drop): Playwright's
  // WebKit starts sequential Tab mid-header and wraps to <body> after ~2 stops
  // without ever entering the feed content (probed 2026-11-16), so the walk is
  // not drivable there. The app structure behind it is axe-clean in BOTH engines
  // and the feed region matches the other screens; the ring-paint spec below
  // still runs in webkit.
  test.skip(browserName === 'webkit', 'webkit: sequential Tab walk not drivable in Playwright-WebKit (wraps to <body> in the header) — see comment above');

  await page.goto('/feed');
  await expect(page.getByRole('heading', { name: 'Feed', exact: true })).toBeVisible();

  // Click a neutral element first: it sets the sequential-focus starting
  // point to the document. WebKit otherwise starts its Tab walk at the
  // header search input and wraps to <body> after the header without ever
  // reaching the content (probed 2026-11-16 in the webkit project).
  await page.getByRole('heading', { name: 'Feed', exact: true }).click();

  for (let i = 0; i < 6; i++) {
    await page.keyboard.press('Tab');
    const focused = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null;
      if (!el) return null;
      const style = window.getComputedStyle(el);
      return {
        tag: el.tagName.toLowerCase(),
        role: el.getAttribute('role'),
        hasVisibleFocusStyle:
          style.boxShadow !== 'none' || style.outlineStyle !== 'none' && style.outlineWidth !== '0px',
        inBody: el !== document.body,
      };
    });
    expect(focused, `Tab stop ${i + 1} must exist`).not.toBeNull();
    expect(focused!.inBody, `Tab stop ${i + 1} must not be <body>`).toBe(true);

    // The focused element is either natively interactive or has an
    // interactive ARIA role, or is the Settings scroll region (deliberately
    // focusable, 2b) / a container with a widget child.
    const nativelyInteractive = ['a', 'button', 'input', 'select', 'textarea', 'summary'].includes(
      focused!.tag
    );
    const roleInteractive = focused!.role !== null && INTERACTIVE_ROLES.includes(focused!.role);
    const scrollRegion = focused!.role === 'region';
    expect(
      nativelyInteractive || roleInteractive || scrollRegion,
      `Tab stop ${i + 1} (${focused!.tag}, role=${focused!.role}) must be interactive`
    ).toBe(true);
  }
});

test('the first Tab stop paints the BRAND focus ring, not just any indicator', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await page.keyboard.press('Tab');

  // The global rule is ring-2 ring-focus-ring (#10F0A8). Asserting the COLOUR
  // matters: a bare "some outline exists" check passes on the browser's
  // default outline, which is exactly what the mutation check proved when the
  // ring was deleted and the test still passed. Poll instead of a one-shot
  // read: elements with a box-shadow transition (cards, inputs) paint the ring
  // over ~200 ms, and WebKit's first Tab stop on /settings is the search input
  // (Chromium's is a header button with no transition) — a synchronous read
  // there catches the ring at 0 in WebKit.
  await expect
    .poll(
      async () =>
        page.evaluate(() => {
          const el = document.activeElement as HTMLElement | null;
          if (!el) return null;
          return window.getComputedStyle(el).boxShadow;
        }),
      { timeout: 5_000 },
    )
    .toContain('rgb(16, 240, 168)');
});
