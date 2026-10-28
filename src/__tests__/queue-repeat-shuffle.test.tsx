/**
 * F05-E3/E4 + review-hardening (replica/test-plan.md) — queueSlice
 * navigation and removal index semantics, pinned as built:
 *   - repeat 'all' wraps past the end; 'one' stays; 'off' stops at the end.
 *   - shuffle is random-PICK (a random valid index each advance — it may
 *     re-pick the current one; "randomizes order" in the plan is tested as
 *     observable range+seeded behavior, not as a reordered list).
 *   - removeItem keeps the PLAYING episode under the cursor: a removal
 *     before the current item shifts the index down (the playing episode
 *     moved up one slot), removal at/after it leaves the index pointing at
 *     the same episode, and the index never goes negative.
 *   - reorderItems tracks the playing episode to its new slot instead of
 *     guessing from the drop target alone.
 * Pure store: no React, no bridge — seeded Math.random makes shuffle
 * deterministic and is restored in a finally.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { useQueueStore } from '../store/slices/queueSlice';
import type { Episode, QueueItem } from '../types';

function seedItems(titles: string[]): QueueItem[] {
  return titles.map((title, i) => ({
    id: `q-${i}`,
    queue_id: 'local',
    episode_id: `ep-${i}`,
    added_at: '2026-10-19T00:00:00Z',
    source: 'feed',
    play_mode: 'unified',
    position: i,
    episode: {
      id: `ep-${i}`,
      channel_id: 'ch-1',
      external_id: `ext-${i}`,
      title,
      video_id: 'yt-video-1',
      is_downloaded: false,
      progress_seconds: 0,
      created_at: '2026-10-19T00:00:00Z',
      updated_at: '2026-10-19T00:00:00Z',
    } satisfies Episode,
  }));
}

beforeEach(() => {
  useQueueStore.setState({
    items: [],
    currentIndex: 0,
    repeatMode: 'off',
    shuffle: false,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('nextTrack repeat modes (F05-E4)', () => {
  it("'all' wraps past the end to the first item", () => {
    useQueueStore.setState({ items: seedItems(['A', 'B']), currentIndex: 1, repeatMode: 'all' });
    useQueueStore.getState().nextTrack();
    expect(useQueueStore.getState().currentIndex).toBe(0);
  });

  it("'one' stays on the current item at the end", () => {
    useQueueStore.setState({ items: seedItems(['A', 'B']), currentIndex: 1, repeatMode: 'one' });
    useQueueStore.getState().nextTrack();
    expect(useQueueStore.getState().currentIndex).toBe(1);
  });

  it("'off' stops at the end (no wrap)", () => {
    useQueueStore.setState({ items: seedItems(['A', 'B']), currentIndex: 1, repeatMode: 'off' });
    useQueueStore.getState().nextTrack();
    expect(useQueueStore.getState().currentIndex).toBe(1);
  });

  it('advances sequentially before the end, regardless of repeat mode', () => {
    useQueueStore.setState({ items: seedItems(['A', 'B']), currentIndex: 0, repeatMode: 'off' });
    useQueueStore.getState().nextTrack();
    expect(useQueueStore.getState().currentIndex).toBe(1);
  });
});

describe('shuffle random-pick (F05-E3)', () => {
  it('advances to the seeded random index', () => {
    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
    useQueueStore.setState({ items: seedItems(['A', 'B']), currentIndex: 1, shuffle: true });
    useQueueStore.getState().nextTrack();
    // floor(0 * 2) = 0 — a valid pick that differs from sequential (which
    // would stay at 1: the end).
    expect(randomSpy).toHaveBeenCalled();
    expect(useQueueStore.getState().currentIndex).toBe(0);
  });

  it('never lands outside the item range', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.999999);
    useQueueStore.setState({ items: seedItems(['A', 'B']), currentIndex: 0, shuffle: true });
    useQueueStore.getState().nextTrack();
    const index = useQueueStore.getState().currentIndex;
    expect(index).toBeGreaterThanOrEqual(0);
    expect(index).toBeLessThanOrEqual(1);
  });

  it('previousTrack under shuffle goes BACK — it is not a random pick', () => {
    // REWRITTEN 2026-10-28 (live-test Task 8). This test previously pinned the
    // OPPOSITE: previousTrack under shuffle picked a RANDOM index, and the
    // assertion above asserted exactly that bug ("lands on the seeded index"
    // meant "wherever Math.random pointed"). The owner's 11:20 decision is
    // explicit that previous must always mean previous, and a random Back that
    // can jump forward is the defect he reported. shuffle reorders the QUEUE;
    // it does not redefine what "back" means.
    const random = vi.spyOn(Math, 'random').mockReturnValue(0);
    try {
      useQueueStore.setState({ items: seedItems(['A', 'B', 'C']), currentIndex: 2, shuffle: true });
      useQueueStore.getState().previousTrack();
      expect(useQueueStore.getState().currentIndex).toBe(1);
      // ...and randomness must not be consulted at all.
      expect(random).not.toHaveBeenCalled();
    } finally {
      random.mockRestore();
    }
  });
});

describe('removeItem index maintenance (F05-N1 slice semantics)', () => {
  it('removing an item BEFORE the playing one shifts the index down (playing episode stays under the cursor)', () => {
    // [A,B,C] playing B (index 1); remove A → B must remain current (index 0).
    // The old clamp (min(currentIndex, length-2)) kept index 1 → pointed at C.
    useQueueStore.setState({ items: seedItems(['A', 'B', 'C']), currentIndex: 1 });
    useQueueStore.getState().removeItem('q-0');
    expect(useQueueStore.getState().items.map((i) => i.episode?.title)).toEqual(['B', 'C']);
    expect(useQueueStore.getState().currentIndex).toBe(0);
  });

  it('removing an item AFTER the playing one leaves the index unchanged', () => {
    useQueueStore.setState({ items: seedItems(['A', 'B', 'C']), currentIndex: 0 });
    useQueueStore.getState().removeItem('q-2');
    expect(useQueueStore.getState().currentIndex).toBe(0);
  });

  it('removing the playing LAST item clamps to the previous remaining one', () => {
    // Regression guard for the N1 engine fallback: [A,B] playing B (1) → [A] at 0.
    useQueueStore.setState({ items: seedItems(['A', 'B']), currentIndex: 1 });
    useQueueStore.getState().removeItem('q-1');
    expect(useQueueStore.getState().currentIndex).toBe(0);
  });

  it('removing the ONLY item resets the index to 0, never -1', () => {
    // Old clamp: min(0, 1-2) = -1 poisoned the store (nothing highlighted
    // after a later addItem until the next advance).
    useQueueStore.setState({ items: seedItems(['A']), currentIndex: 0 });
    useQueueStore.getState().removeItem('q-0');
    expect(useQueueStore.getState().items).toHaveLength(0);
    expect(useQueueStore.getState().currentIndex).toBe(0);
  });
});

describe('reorderItems current-index tracking (F05-H1)', () => {
  it('dragging the PLAYING item moves the cursor with it', () => {
    // [A,B,C] playing B (1); drag B to the top → B is at 0 and must stay current.
    // The old toIndex-keyed math landed the cursor on C (index 2).
    useQueueStore.setState({ items: seedItems(['A', 'B', 'C']), currentIndex: 1 });
    useQueueStore.getState().reorderItems(1, 0);
    expect(useQueueStore.getState().items.map((i) => i.episode?.title)).toEqual(['B', 'A', 'C']);
    expect(useQueueStore.getState().currentIndex).toBe(0);
  });

  it('dragging the playing item to the end keeps it current', () => {
    useQueueStore.setState({ items: seedItems(['A', 'B', 'C']), currentIndex: 1 });
    useQueueStore.getState().reorderItems(1, 2);
    expect(useQueueStore.getState().items.map((i) => i.episode?.title)).toEqual(['A', 'C', 'B']);
    expect(useQueueStore.getState().currentIndex).toBe(2);
  });

  it('dragging a non-playing item from before the cursor to at/after it shifts the cursor down', () => {
    // [A,B,C,D] playing C (2); drag A to the end → C is now at index 1.
    useQueueStore.setState({ items: seedItems(['A', 'B', 'C', 'D']), currentIndex: 2 });
    useQueueStore.getState().reorderItems(0, 3);
    expect(useQueueStore.getState().items.map((i) => i.episode?.title)).toEqual(['B', 'C', 'D', 'A']);
    expect(useQueueStore.getState().currentIndex).toBe(1);
  });

  it('dragging a non-playing item from after the cursor to at/before it shifts the cursor up', () => {
    // [A,B,C,D] playing A (0); drag D to the front → A is now at index 1.
    useQueueStore.setState({ items: seedItems(['A', 'B', 'C', 'D']), currentIndex: 0 });
    useQueueStore.getState().reorderItems(3, 0);
    expect(useQueueStore.getState().items.map((i) => i.episode?.title)).toEqual(['D', 'A', 'B', 'C']);
    expect(useQueueStore.getState().currentIndex).toBe(1);
  });

  it('reordering entirely before the cursor leaves it unchanged', () => {
    // [A,B,C,D] playing C (2); drag A→B (0→1): C does not move.
    useQueueStore.setState({ items: seedItems(['A', 'B', 'C', 'D']), currentIndex: 2 });
    useQueueStore.getState().reorderItems(0, 1);
    expect(useQueueStore.getState().items.map((i) => i.episode?.title)).toEqual(['B', 'A', 'C', 'D']);
    expect(useQueueStore.getState().currentIndex).toBe(2);
  });
});
