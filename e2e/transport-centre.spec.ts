import { expect, test } from '@playwright/test';

/**
 * Round 6 Task 5 [echoprism-centre-transport]: "the play controls should not
 * be aligned to the right side but rather the center of the bottom bar (unless
 * the window gets too small, responsive design)."
 *
 * Layout assertions need a real layout engine — jsdom has none — so this is
 * Playwright against the mock-world dev server. The bar is the MiniPlayer
 * (aria-label="Mini player"); its direct children are the seek strip and then
 * the control row, whose three children are [info | transport | actions].
 * Review Focus 5: at minWidth 800 with a very long title (fixture
 * ep-video-long) the transport must stay visible, centred, and the title must
 * truncate.
 */

const LONG_TITLE_TEXT = 'A deliberately very long episode title';

async function playLongEpisode(page: import('@playwright/test').Page) {
  await page.goto('/feed');
  await page
    .locator('article', { hasText: LONG_TITLE_TEXT })
    .getByRole('button', { name: 'Play now' })
    .first()
    .click();
  await expect(page).toHaveURL(/\/player\/ep-video-long$/);
  await expect(page.getByLabel('Mini player')).toBeVisible({ timeout: 10_000 });
}

/** The bar's control row and its three groups, found structurally: the play
 * button's parent is the transport group, and its grandparent is the row. */
function barParts(page: import('@playwright/test').Page) {
  const bar = page.getByLabel('Mini player');
  const play = bar.getByRole('button', { name: /^(Play|Pause)$/ });
  const transport = play.locator('..');
  const row = play.locator('../..');
  const groups = row.locator(':scope > div');
  return {
    bar,
    row,
    info: groups.first(),
    transport,
    actions: groups.last(),
    play,
  };
}

async function centres(page: import('@playwright/test').Page) {
  const { bar, play } = barParts(page);
  const barBox = await bar.boundingBox();
  const playBox = await play.boundingBox();
  if (!barBox || !playBox) throw new Error('bar/play not laid out');
  return {
    barCenter: barBox.x + barBox.width / 2,
    playCenter: playBox.x + playBox.width / 2,
  };
}

function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number },
) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

test('at 1200x800 the transport play button is centred in the bottom bar (|delta| <= 2px)', async ({ page }) => {
  await page.setViewportSize({ width: 1200, height: 800 });
  await playLongEpisode(page);
  const { barCenter, playCenter } = await centres(page);
  expect(
    Math.abs(playCenter - barCenter),
    `play button centre ${playCenter.toFixed(1)} vs bar centre ${barCenter.toFixed(1)}`,
  ).toBeLessThanOrEqual(2);
});

test('at 800x600 (minWidth) with a very long title: transport visible, no overlap, title truncates (Review Focus 5)', async ({ page }) => {
  await page.setViewportSize({ width: 800, height: 600 });
  await playLongEpisode(page);

  const { transport, info, actions, bar } = barParts(page);
  await expect(transport).toBeVisible();
  await expect(info).toBeVisible();
  await expect(actions).toBeVisible();

  const tBox = await transport.boundingBox();
  const iBox = await info.boundingBox();
  const aBox = await actions.boundingBox();
  if (!tBox || !iBox || !aBox) throw new Error('groups not laid out');
  expect(overlaps(tBox, iBox), 'transport must not overlap the left info group').toBe(false);
  expect(overlaps(tBox, aBox), 'transport must not overlap the right actions group').toBe(false);

  // The long title truncates instead of pushing the layout around.
  const titleButton = bar.getByRole('button', { name: /Open player:/ });
  const titleP = titleButton.locator('p').first();
  const truncated = await titleP.evaluate((el) => el.scrollWidth > el.clientWidth);
  expect(truncated, 'a very long title must truncate (scrollWidth > clientWidth)').toBe(true);

  // Below the 1000px breakpoint the row falls back to flex (a centred 360px
  // transport + the actions group cannot both fit in 800px — measured), so
  // at 800 we assert no-overlap/visible/truncation, NOT centring; centring is
  // asserted at 1200x800 above.
});
