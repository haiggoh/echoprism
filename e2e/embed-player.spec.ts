import { expect, test } from '@playwright/test';

/**
 * Task 5 e2e (webkit, the shipped engine): the YouTube embed player through
 * the app's real player path, with the IFrame API host page STUBBED at the
 * proxy origin via page.route — no network to YouTube. The stub implements
 * the postMessage contract of src-tauri/resources/embed_player.html.
 */
test.skip(({ browserName }) => browserName !== 'webkit', 'webkit only: the shipped engine');

const STUB_HOST_PAGE = `<!doctype html><html><body><div id="player"></div><script>
  // mirrors the real host page: "ready" fires when the player is up, BEFORE
  // any command — the app queues commands until then
  window.parent.postMessage({ type: 'ready' }, '*');
  var player = { videoId: null, t: 0 };
  var ticking = false;
  function startTicks() {
    if (ticking) return;
    ticking = true;
    setInterval(function () {
      player.t += 0.25;
      window.parent.postMessage({ type: 'time', t: player.t }, '*');
    }, 250);
  }
  window.addEventListener('message', function (ev) {
    var m = ev.data;
    if (!m || !m.cmd) return;
    if (m.cmd === 'load') {
      player.videoId = m.videoId;
      window.parent.postMessage({ type: 'ready' }, '*');
      if (m.videoId === 'embed-blocked-150') {
        window.parent.postMessage({ type: 'error', code: 150 }, '*');
        return;
      }
      window.parent.postMessage({ type: 'state', state: 2 }, '*');
      if (m.autoplay) { window.parent.postMessage({ type: 'state', state: 1 }, '*'); startTicks(); }
    } else if (m.cmd === 'play') {
      window.parent.postMessage({ type: 'state', state: 1 }, '*'); startTicks();
    } else if (m.cmd === 'pause') {
      window.parent.postMessage({ type: 'state', state: 2 }, '*');
    } else if (m.cmd === 'seek') {
      player.t = m.t;
      window.parent.postMessage({ type: 'time', t: m.t }, '*');
    }
  });
</script></body></html>`;

async function stubEmbedHostPage(page: import('@playwright/test').Page) {
  await page.route('**/embed/player.html', (route) =>
    route.fulfill({ contentType: 'text/html', body: STUB_HOST_PAGE }),
  );
}

async function enableEmbedToggle(page: import('@playwright/test').Page) {
  await page.goto('/settings');
  await page.getByRole('tab', { name: 'Preferences' }).click();
  const toggle = page.getByLabel("Use YouTube's player for video");
  await toggle.check();
  await expect(toggle).toBeChecked();
  // no page.goto after this: a full reload re-initialises the mock db and loses
  // the write. Navigate with the in-app sidebar link (SPA, mock state persists).
}

async function goToFeed(page: import('@playwright/test').Page) {
  await page.getByRole('link', { name: 'Feed' }).click();
  await expect(page).toHaveURL(/\/feed/);
}

const sliderPos = (page: import('@playwright/test').Page) =>
  page.locator('[aria-valuenow][aria-valuetext*=" of "]').first().getAttribute('aria-valuenow').then(Number);

test('embed player: toggle on → proxy-origin iframe plays; seek flows to the embed', async ({ page }) => {
  const embedRequests: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/embed/player.html')) embedRequests.push(r.url());
  });
  await stubEmbedHostPage(page);
  await enableEmbedToggle(page);

  await goToFeed(page);
  await page
    .locator('article', { hasText: 'HLS master fixture' })
    .getByRole('button', { name: 'Play now' })
    .first()
    .click();
  await expect(page).toHaveURL(/\/player\/ep-hls-demo$/);

  // the embed stage is active and the iframe loads from the proxy origin
  const embedStage = page.getByTestId('embed-stage');
  await expect(embedStage).toBeVisible();
  await expect(embedStage.locator('iframe')).toHaveAttribute('src', /http:\/\/127\.0\.0\.1:1420\/embed\/player\.html/);
  await expect.poll(() => embedRequests.length, { timeout: 10_000 }).toBeGreaterThan(0);

  // the stub's time events drive the store → the mini player slider advances
  await expect.poll(() => sliderPos(page), { timeout: 10_000 }).toBeGreaterThanOrEqual(1);

  // ArrowRight on the seek slider = +10 s (clamped to the 4 s fixture) → the
  // embed receives the seek and the store follows the stub's time echo
  const before = await sliderPos(page);
  await page.locator('[aria-valuenow][aria-valuetext*=" of "]').first().focus();
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => sliderPos(page), { timeout: 10_000 }).toBe(4);
  expect(before).toBeLessThan(4);
});

test('embed error 150 falls back to the extractor player (real HLS master plays)', async ({ page }) => {
  await stubEmbedHostPage(page);
  await enableEmbedToggle(page);

  await goToFeed(page);
  await page
    .locator('article', { hasText: 'embed blocked fixture' })
    .getByRole('button', { name: 'Play now' })
    .first()
    .click();
  await expect(page).toHaveURL(/\/player\/ep-embed-blocked$/);
  await expect(page.getByTestId('embed-stage')).toBeVisible();

  // the stub posts error 150 → the video element takes over and plays the HLS master
  const video = page.locator('video');
  await expect(video).toHaveAttribute('src', /\/test-media\/hls\/master\.m3u8(\?|$)/, { timeout: 15_000 });
  await expect
    .poll(async () => video.evaluate((el) => (el as HTMLVideoElement).paused), { timeout: 15_000 })
    .toBe(false);
  await expect(page.getByTestId('embed-stage')).toBeHidden();
});

test('toggle off (default): zero embed traffic, plain video element plays', async ({ page }) => {
  let embedCount = 0;
  page.on('request', (r) => {
    if (r.url().includes('/embed/player.html')) embedCount++;
  });
  await page.goto('/feed');
  await page
    .locator('article', { hasText: 'HLS master fixture' })
    .getByRole('button', { name: 'Play now' })
    .first()
    .click();
  await expect(page).toHaveURL(/\/player\/ep-hls-demo$/);

  const video = page.locator('video');
  await expect
    .poll(async () => video.evaluate((el) => (el as HTMLVideoElement).paused), { timeout: 15_000 })
    .toBe(false);
  await expect(page.getByTestId('embed-stage')).toHaveCount(0);
  expect(embedCount, 'no /embed/player.html request with the toggle off').toBe(0);
});
