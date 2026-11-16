import { expect, test } from '@playwright/test';

/**
 * Task 1 (docs/plans/2026-11-16-followups-plan.md): native-HLS end-to-end in
 * WebKit — the engine the shipped app actually runs on (Tauri WKWebView), and
 * the only bundled browser that plays `application/vnd.apple.mpegurl` without
 * hls.js. The fixtures stream from the dev-only /test-media middleware
 * (e2e/fixtures/hls/, see its README); the specs drive the app's real player
 * path (feed card → Play now → PlayerProvider resolve → <video>), not a bare
 * <video> page.
 *
 * The quality-cap behaviour is asserted in Rust on this same fixture, at both
 * levels: the pure filter (hls_master.rs::e2e_fixture_master_is_filtered_by_cap)
 * and the served route (stream_proxy.rs::hls_route_serves_fixture_master_filtered_by_cap).
 */
test.skip(({ browserName }) => browserName !== 'webkit', 'native HLS playback: only WebKit (the shipped engine) plays m3u8 natively');

test('hls_video_plays_in_webkit: the HLS master reaches playing through the real player path', async ({ page }) => {
  // Armed BEFORE the click: the variant playlist request fires as soon as the
  // master parses. If HLS media never flows, this wait times out → RED.
  const variantResp = page.waitForResponse(
    (r) => /\/test-media\/hls\/v(180|360)\/playlist\.m3u8/.test(r.url()) && r.status() === 200,
  );

  await page.goto('/feed');
  await page
    .locator('article', { hasText: 'HLS master fixture' })
    .getByRole('button', { name: 'Play now' })
    .first()
    .click();
  await expect(page).toHaveURL(/\/player\/ep-hls-demo$/);

  const video = page.locator('video');
  await expect(video).toBeVisible();
  // Committed to the HLS master itself.
  await expect(video).toHaveAttribute('src', /\/test-media\/hls\/master\.m3u8$/, { timeout: 10_000 });

  // Delivery-shaped proof (M1): real playlist fetch + real pixels + real
  // playback progress on the element itself, not a resolved promise.
  expect((await variantResp).status()).toBe(200);
  await expect
    .poll(async () => video.evaluate((el) => (el as HTMLVideoElement).paused), { timeout: 15_000 })
    .toBe(false);
  await expect
    .poll(async () => video.evaluate((el) => (el as HTMLVideoElement).videoWidth), { timeout: 15_000 })
    .toBeGreaterThan(0);
  await expect
    .poll(async () => video.evaluate((el) => (el as HTMLVideoElement).currentTime), { timeout: 15_000 })
    .toBeGreaterThan(0);

  // The FINAL src must STILL be the master. This is the assertion that makes
  // the spec catch a broken master: if the master had failed and the fallback
  // (fallback.mp4, also 640x360) had played, every poll above would pass —
  // but this one goes RED. (M1 validator mutation a1.)
  await expect(video).toHaveAttribute('src', /\/test-media\/hls\/master\.m3u8$/);

  // The resolve went through PlayerProvider (its .then writes the history row),
  // not a bare <video> page that loads the URL directly. Navigate IN-APP — a
  // page.goto would reload and reset the mock world's in-memory history.
  // Scoped to history-row: the mini player shows the same title elsewhere.
  await page.getByRole('link', { name: 'History' }).click();
  await expect(page.getByRole('heading', { name: /^History$/ })).toBeVisible();
  await expect(
    page.getByTestId('history-row').getByText(/HLS master fixture plays in WebKit/),
  ).toBeVisible({ timeout: 10_000 });
});

test('audio_mode_plays_audio_only_hls_without_fragment_walk: the audio-only rendition reaches playing with a handful of media requests', async ({ page }) => {
  // Task 2a delivery proof (§10 A) in the shipped engine: audio-only HLS
  // reaches `playing` with a few media requests — NOT the ~158 fragment-hop
  // walk a fragmented progressive m4a forces (measured 105 s / 101 requests).
  const mediaReqs: string[] = [];
  page.on('request', (r) => {
    if (r.url().includes('/test-media/hls/audio/')) mediaReqs.push(r.url());
  });

  await page.goto('/feed');
  await page.getByRole('checkbox', { name: 'Audio only mode' }).check();
  await page
    .locator('article', { hasText: 'HLS audio-only rendition' })
    .getByRole('button', { name: 'Play now' })
    .first()
    .click();
  await expect(page).toHaveURL(/\/player\/ep-hls-audio$/);

  const audio = page.locator('audio');
  await expect(audio).toHaveAttribute('src', /\/test-media\/hls\/audio\/media\.m3u8$/, { timeout: 10_000 });
  await expect
    .poll(async () => audio.evaluate((el) => (el as HTMLAudioElement).paused), { timeout: 15_000 })
    .toBe(false);
  await expect
    .poll(async () => audio.evaluate((el) => (el as HTMLAudioElement).currentTime), { timeout: 15_000 })
    .toBeGreaterThan(0);
  console.log('AUDIO-HLS media requests:', mediaReqs.length, mediaReqs.join(' '));
  expect(mediaReqs.length).toBeLessThanOrEqual(5);
});

test('broken_hls_falls_back_to_progressive: a 404 master lands on fallback_url', async ({ page }) => {
  // The broken master must REALLY have been requested and 404'd — otherwise
  // "fallback" could be the primary URL and this test would prove nothing.
  const notFound = page.waitForResponse(
    (r) => r.url().includes('/test-media/hls/absent/master.m3u8') && r.status() === 404,
  );

  await page.goto('/feed');
  await page
    .locator('article', { hasText: 'HLS broken master' })
    .getByRole('button', { name: 'Play now' })
    .first()
    .click();
  await expect(page).toHaveURL(/\/player\/ep-hls-broken$/);

  const video = page.locator('video');
  await expect(video).toBeVisible();
  expect((await notFound).status()).toBe(404);

  // The player's media-error path swaps to the progressive fallback, which
  // then plays (PlayerProvider onError → setStreamUrl(fallbackUrl)).
  await expect(video).toHaveAttribute('src', /\/test-media\/hls\/fallback\.mp4$/, { timeout: 15_000 });
  await expect
    .poll(async () => video.evaluate((el) => (el as HTMLVideoElement).paused), { timeout: 15_000 })
    .toBe(false);
  await expect
    .poll(async () => video.evaluate((el) => (el as HTMLVideoElement).currentTime), { timeout: 15_000 })
    .toBeGreaterThan(0);
  // currentSrc is the URL the element is actually playing.
  await expect
    .poll(async () => video.evaluate((el) => (el as HTMLVideoElement).currentSrc), { timeout: 5_000 })
    .toContain('/test-media/hls/fallback.mp4');
});
