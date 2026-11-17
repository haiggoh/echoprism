import { expect, test } from '@playwright/test';

/**
 * Owner report 2026-11-17 (live on the released build): switching a YouTube
 * video to audio-only mid-playback is fast now, but the PLAYHEAD JUMPS — the
 * F06 format-switch position restore (Round 6 Task 1) loses the position when
 * the switch happens while playing in the real WKWebView.
 *
 * Repro through the app's real player path in webkit: play the HLS fixture
 * video, seek to 2 s, toggle audio-only, then assert the audio element's
 * currentTime is still ≈ 2 s (the store restore must survive the element swap
 * and the HLS load).
 */
test.skip(({ browserName }) => browserName !== 'webkit', 'webkit only: the shipped engine');

test('video→audio switch mid-playback keeps the playhead (fresh url per resolve)', async ({ page }) => {
  // Cold-resolve shape: the mock mints a fresh proxy-token url per resolve.
  await page.addInitScript(() => {
    (window as unknown as { __EP_STREAM_NONCE?: boolean }).__EP_STREAM_NONCE = true;
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

  // Seek to 2 s, then wait until the STORE has recorded it: the mini-player
  // seek slider's aria-valuenow reads the store position, so polling it proves
  // the timeupdate landed. A fixed sleep raced it and the switch restored 0
  // (flaked 1 of 2 runs, 2026-11-17).
  await video.evaluate((el) => {
    (el as HTMLVideoElement).currentTime = 2;
  });
  await expect
    .poll(
      async () =>
        Number(
          await page.locator('[aria-valuenow][aria-valuetext*=" of "]').first().getAttribute('aria-valuenow'),
        ),
      { timeout: 10_000 },
    )
    .toBeGreaterThanOrEqual(2);

  // Toggle audio-only mid-playback (the owner's scenario).
  await page.getByRole('checkbox', { name: 'Audio only mode' }).first().check();

  const audio = page.locator('audio');
  await expect(audio).toHaveAttribute('src', /\/test-media\/hls\/audio\/media\.m3u8(\?|$)/, { timeout: 15_000 });
  await expect
    .poll(async () => audio.evaluate((el) => (el as HTMLAudioElement).paused), { timeout: 15_000 })
    .toBe(false);

  const pos = await audio.evaluate((el) => (el as HTMLAudioElement).currentTime);
  console.log('PLAYHEAD AFTER video→audio SWITCH:', pos);
  expect(pos, `playhead jumped to ${pos} (wanted ≈ 2)`).toBeGreaterThan(1.5);
  expect(pos).toBeLessThan(2.5);

  // The owner's report is about switching BACK AND FORTH: let the audio
  // element advance past 2 s, then switch back to video. A cache-hit
  // re-resolve returns the SAME url, so the player's src-change (restore)
  // branch is skipped and the video element would resume its own stale
  // position instead of the store's (audio's) position.
  // Let the audio element advance AND the store record it (poll the same
  // store-driven slider until it passes 3 s) before switching back.
  await expect
    .poll(
      async () =>
        Number(
          await page.locator('[aria-valuenow][aria-valuetext*=" of "]').first().getAttribute('aria-valuenow'),
        ),
      { timeout: 10_000 },
    )
    .toBeGreaterThanOrEqual(3);
  const audioPos = await audio.evaluate((el) => (el as HTMLAudioElement).currentTime);
  console.log('audio position before switch-back:', audioPos);

  await page.getByRole('checkbox', { name: 'Audio only mode' }).first().uncheck();
  await expect
    .poll(async () => video.evaluate((el) => (el as HTMLVideoElement).paused), { timeout: 15_000 })
    .toBe(false);
  const pos2 = await video.evaluate((el) => (el as HTMLVideoElement).currentTime);
  console.log('PLAYHEAD AFTER audio→video SWITCH BACK:', pos2, '(store/audio had', audioPos, ')');
  expect(
    pos2,
    `playhead jumped on switch-back to ${pos2} — store had ${audioPos}`,
  ).toBeGreaterThan(audioPos - 0.5);
});

test('cache-hit switch (SAME re-resolved url) keeps the playhead in WebKit', async ({ page }) => {
  // No __EP_STREAM_NONCE: the mock returns the STABLE url per format, i.e. the
  // stream-cache-hit shape. The <audio> element stays MOUNTED across switches
  // (PlayerProvider renders it always), so on the SECOND video->audio leg the
  // re-resolved url equals the src the audio element still carries and the
  // restore must run on the element switch, not on a src change (owner report
  // 2026-11-17; validator finding: the fresh-url path never exercises that
  // branch in the real engine — the <video> remounts fresh on every video leg).
  await page.goto('/feed');
  await page
    .locator('article', { hasText: 'HLS master fixture' })
    .getByRole('button', { name: 'Play now' })
    .first()
    .click();
  await expect(page).toHaveURL(/\/player\/ep-hls-demo$/);

  const video = page.locator('video');
  const slider = page.locator('[aria-valuenow][aria-valuetext*=" of "]').first();
  const sliderPos = async () => Number(await slider.getAttribute('aria-valuenow'));
  const waitStore = (min: number) => expect.poll(sliderPos, { timeout: 10_000 }).toBeGreaterThanOrEqual(min);

  await expect
    .poll(async () => video.evaluate((el) => (el as HTMLVideoElement).paused), { timeout: 15_000 })
    .toBe(false);
  const videoSrc = await video.getAttribute('src');
  expect(videoSrc, 'cache-hit shape: stable url, no per-resolve query').toBe('/test-media/hls/master.m3u8');

  await video.evaluate((el) => {
    (el as HTMLVideoElement).currentTime = 0.5;
  });
  await waitStore(1); // the store recorded the seek (slider is store-driven)

  // Leg 1: video -> audio. The audio element's src was null, so this leg takes
  // the src-change branch.
  await page.getByRole('checkbox', { name: 'Audio only mode' }).first().check();
  const audio = page.locator('audio');
  await expect(audio).toHaveAttribute('src', /\/test-media\/hls\/audio\/media\.m3u8$/, { timeout: 15_000 });
  const audioSrc = await audio.getAttribute('src');
  await expect
    .poll(async () => audio.evaluate((el) => (el as HTMLAudioElement).paused), { timeout: 15_000 })
    .toBe(false);
  const pos1 = await audio.evaluate((el) => (el as HTMLAudioElement).currentTime);
  console.log('LEG1 video→audio playhead:', pos1);
  expect(pos1).toBeGreaterThan(0);
  expect(pos1).toBeLessThan(1.5);
  await waitStore(2); // audio advanced; the store follows the ACTIVE element

  // Leg 2: audio -> video. The video element REMOUNTS (fresh src attribute),
  // so this leg always takes the src-change branch too.
  await page.getByRole('checkbox', { name: 'Audio only mode' }).first().uncheck();
  await expect
    .poll(async () => video.evaluate((el) => (el as HTMLVideoElement).paused), { timeout: 15_000 })
    .toBe(false);
  const pos2 = await video.evaluate((el) => (el as HTMLVideoElement).currentTime);
  const store2 = await sliderPos();
  console.log('LEG2 audio→video playhead:', pos2, 'store:', store2);
  expect(pos2).toBeGreaterThan(store2 - 0.5);
  await waitStore(3); // video advanced past 3 s

  // Leg 3: video -> audio AGAIN. Cache hit: the re-resolve returns the SAME
  // audio url the always-mounted <audio> element still carries, so the
  // src-change branch is skipped — this is the branch the fix added.
  const storeBefore = await sliderPos();
  await page.getByRole('checkbox', { name: 'Audio only mode' }).first().check();
  await expect
    .poll(async () => audio.evaluate((el) => (el as HTMLAudioElement).paused), { timeout: 15_000 })
    .toBe(false);
  const srcAfter = await audio.getAttribute('src');
  expect(srcAfter, 'leg-3 re-resolve returned the SAME url (cache-hit shape proven)').toBe(audioSrc);
  const pos3 = await audio.evaluate((el) => (el as HTMLAudioElement).currentTime);
  console.log('LEG3 video→audio (same url) playhead:', pos3, 'store before:', storeBefore);
  expect(
    pos3,
    `playhead jumped on same-url switch to ${pos3} — store had ${storeBefore}`,
  ).toBeGreaterThan(storeBefore - 0.5);
});
