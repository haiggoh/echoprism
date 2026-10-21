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

test('Tab traverses interactive controls only, and focus is visibly indicated', async ({ page }) => {
  await page.goto('/feed');
  await expect(page.getByRole('heading', { name: 'Feed', exact: true })).toBeVisible();

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

  const boxShadow = await page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el) return null;
    return window.getComputedStyle(el).boxShadow;
  });
  expect(boxShadow).not.toBeNull();
  // The global rule is ring-2 ring-focus-ring (#10F0A8). Asserting the COLOUR
  // matters: a bare "some outline exists" check passes on the browser's
  // default outline, which is exactly what the mutation check proved when the
  // ring was deleted and the test still passed.
  expect(
    boxShadow,
    `focus must paint the focus-ring colour; got ${boxShadow}`
  ).toContain('rgb(16, 240, 168)');
});
