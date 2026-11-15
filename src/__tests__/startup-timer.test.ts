/**
 * Startup timer (plan: browser-fast playback start, Task 1).
 * click → urlReady → firstFrame produces one StartupRecord and reports it
 * to the backend via the tauri bridge's report_startup command.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../tauri-bridge', () => ({
  invoke: vi.fn().mockResolvedValue(undefined),
}));

import { invoke } from '../tauri-bridge';
import { startupTimer } from '../lib/startupTimer';

describe('startupTimer', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    vi.mocked(invoke).mockClear();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('measures click→urlReady→firstFrame and reports one record', () => {
    startupTimer.click('ep-1', 'youtube-video');
    vi.setSystemTime(800);
    startupTimer.urlReady('ep-1');
    vi.setSystemTime(1200);
    const rec = startupTimer.firstFrame('ep-1');

    expect(rec).toEqual({
      episode_id: 'ep-1',
      source: 'youtube-video',
      path: 'cold',
      click_to_url_ms: 800,
      url_to_first_frame_ms: 400,
      total_ms: 1200,
      timings: undefined,
    });
    expect(invoke).toHaveBeenCalledWith('report_startup', { record: rec });
  });

  it('returns null for firstFrame without a click', () => {
    expect(startupTimer.firstFrame('ep-1')).toBeNull();
  });

  it('a second click for another episode resets the pending play', () => {
    startupTimer.click('ep-1', 'youtube-video');
    startupTimer.click('ep-2', 'youtube-audio');
    // The stale episode's first frame no longer measures anything.
    expect(startupTimer.firstFrame('ep-1')).toBeNull();

    vi.setSystemTime(500);
    startupTimer.urlReady('ep-2', { instances_ms: 10, ytdlp_ms: 300, gate_ms: 100, probe_ms: 5, cache_hit: true });
    vi.setSystemTime(700);
    const rec = startupTimer.firstFrame('ep-2');
    expect(rec).not.toBeNull();
    expect(rec?.source).toBe('youtube-audio');
    // cache_hit → the play took the pre-resolved path.
    expect(rec?.path).toBe('pre-resolved');
    expect(rec?.click_to_url_ms).toBe(500);
    expect(rec?.timings?.ytdlp_ms).toBe(300);
  });
});
