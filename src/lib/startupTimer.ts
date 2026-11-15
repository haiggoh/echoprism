/**
 * Start-up timer (plan: browser-fast playback start, Task 1).
 *
 * Measures one play: click → URL ready → first frame, and reports the
 * finished record to the backend (`report_startup`), which keeps the last
 * 50 and logs a greppable `startup total_ms=` line. Only the LATEST play is
 * measured: a new click replaces the pending one.
 */
import { invoke } from '../tauri-bridge';
import type { ResolveTimings, StartupRecord, StartupSource } from '../types';

interface Pending {
  episodeId: string;
  source: StartupSource;
  clickAt: number;
  urlAt?: number;
  timings?: ResolveTimings | null;
  cacheHit: boolean;
}

let pending: Pending | null = null;

export const startupTimer = {
  /** Call at the top of every play/load that will start or restart playback. */
  click(episodeId: string, source: StartupSource): void {
    pending = { episodeId, source, clickAt: Date.now(), cacheHit: false };
  },

  /** Call when the resolved URL is committed (setStreamUrl). */
  urlReady(episodeId: string, timings?: ResolveTimings | null, cacheHit?: boolean): void {
    if (!pending || pending.episodeId !== episodeId) return;
    pending.urlAt = Date.now();
    pending.timings = timings ?? undefined;
    pending.cacheHit = cacheHit ?? timings?.cache_hit ?? false;
  },

  /**
   * Call on the media element's first `playing` event for the resolved src.
   * Returns the finished record (and reports it), or null when no play is
   * pending for this episode — later `playing` events (seeks) are no-ops.
   */
  firstFrame(episodeId: string): StartupRecord | null {
    if (!pending || pending.episodeId !== episodeId || pending.urlAt === undefined) {
      return null;
    }
    const now = Date.now();
    const rec: StartupRecord = {
      episode_id: pending.episodeId,
      source: pending.source,
      path: pending.cacheHit ? 'pre-resolved' : 'cold',
      click_to_url_ms: pending.urlAt - pending.clickAt,
      url_to_first_frame_ms: now - pending.urlAt,
      total_ms: now - pending.clickAt,
      timings: pending.timings,
    };
    pending = null;
    // The report must never break playback: log, don't throw.
    invoke('report_startup', { record: rec }).catch((err: unknown) =>
      console.warn('startup timer: report failed', err),
    );
    return rec;
  },
};
