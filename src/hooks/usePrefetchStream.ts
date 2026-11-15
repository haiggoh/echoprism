import { useEffect, useRef } from 'react';
import type { Episode, QueueItem } from '../types';
import { episodeCommands } from './useTauriCommands';
import { usePlayerStore } from '../store/slices/playerSlice';

/** Hover dwell before a pre-resolve fires (owner-approved 400 ms). */
export const PREFETCH_DWELL_MS = 400;

/** How many upcoming queue items get pre-resolved while one plays. */
export const QUEUE_LOOKAHEAD = 2;

/**
 * Pre-resolve one episode on hover dwell. No-op for podcasts (no video_id)
 * — the backend choke point (prefetch_gate) guards the same rule again.
 * The format sent is the CURRENT play mode so the cached entry matches what
 * a click would resolve (a mode toggle just resolves the other mode).
 */
export function usePrefetchStream(episode: Episode): { onPointerEnter(): void; onPointerLeave(): void } {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAudioMode = usePlayerStore((s) => s.isAudioMode);

  useEffect(
    () => () => {
      if (timerRef.current !== null) clearTimeout(timerRef.current);
    },
    [],
  );

  const onPointerEnter = () => {
    if (!episode.video_id) return; // podcasts: never on hover
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      episodeCommands
        .prefetch(episode.id, isAudioMode ? 'audio' : 'video', 'hover')
        .catch(() => {
          /* prefetch is best-effort: a failed pre-resolve must never surface */
        });
    }, PREFETCH_DWELL_MS);
  };

  const onPointerLeave = () => {
    if (timerRef.current !== null) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  return { onPointerEnter, onPointerLeave };
}

interface QueueLookState {
  items: QueueItem[];
  currentIndex: number;
  repeatMode: 'off' | 'one' | 'all';
  shuffle: boolean;
}

/**
 * The next `n` episodes after the queue cursor. Pure. Wraps around only on
 * repeat 'all'; on shuffle the next item is unpredictable → [].
 */
export function upcomingQueueEpisodes(state: QueueLookState, n: number): Episode[] {
  if (state.shuffle || state.items.length === 0) return [];
  const out: Episode[] = [];
  for (let k = 1; k <= n; k++) {
    let idx = state.currentIndex + k;
    if (idx >= state.items.length) {
      if (state.repeatMode !== 'all') break;
      idx %= state.items.length;
    }
    const ep = state.items[idx]?.episode;
    if (ep) out.push(ep);
  }
  return out;
}
