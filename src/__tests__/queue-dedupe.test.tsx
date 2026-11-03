// @vitest-environment jsdom
/**
 * Live-test batch 4, item 1 (owner 2026-11-02): "it should not be possible to
 * queue the same video or podcast multiple times in the same queue. once a
 * video is currently playing or coming up later in the queue, queuing it
 * again can only change its position in the queue to play next but should
 * never add it multiple times."
 *
 * So addItem / playNextItem / playNowItem all DEDUPE on episode_id: an
 * existing twin moves to the target slot instead of being inserted again,
 * and the cursor keeps pointing at the playing episode (playNowItem moves
 * the cursor onto the new clip — owner answer: inserted AT THE CURSOR,
 * before the current item).
 *
 * Discriminants: a duplicate insert fails the length assertions; a cursor
 * that stops pointing at the playing episode fails the currentIndex ones.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { useQueueStore } from '../store/slices/queueSlice';
import type { Episode, QueueItem } from '../types';

function ep(id: string): Episode {
  return {
    id,
    channel_id: 'ch-1',
    external_id: `ext-${id}`,
    title: `Title ${id}`,
    is_downloaded: false,
    progress_seconds: 0,
    created_at: '2026-11-02T00:00:00Z',
    updated_at: '2026-11-02T00:00:00Z',
  };
}

function itemOf(e: Episode): Omit<QueueItem, 'id' | 'position'> {
  return {
    queue_id: 'local',
    episode_id: e.id,
    added_at: '2026-11-02T00:00:00Z',
    source: 'feed',
    play_mode: 'unified',
    episode: e,
  };
}

function seed(ids: string[], cursor = 0) {
  useQueueStore.setState({
    items: ids.map((id, i) => ({ ...itemOf(ep(id)), id: `q-${id}`, position: i })),
    currentIndex: cursor,
  });
}

const order = () => useQueueStore.getState().items.map((i) => i.episode_id);

beforeEach(() => {
  useQueueStore.setState({ items: [], currentIndex: 0 });
});

describe('batch 4 item 1: queue never holds the same episode twice', () => {
  it('addItem appends a new episode, moves a queued twin to the end', () => {
    seed(['A', 'B', 'C'], 0);
    useQueueStore.getState().addItem(itemOf(ep('D')));
    expect(order()).toEqual(['A', 'B', 'C', 'D']);

    useQueueStore.getState().addItem(itemOf(ep('B')));
    expect(order()).toEqual(['A', 'C', 'D', 'B']);
    expect(useQueueStore.getState().items).toHaveLength(4);
    expect(useQueueStore.getState().currentIndex).toBe(0);
  });

  it('playNextItem inserts after the cursor; a twin is moved there instead of duplicated', () => {
    seed(['A', 'B', 'C'], 0);
    useQueueStore.getState().playNextItem(itemOf(ep('D')));
    expect(order()).toEqual(['A', 'D', 'B', 'C']);

    useQueueStore.getState().playNextItem(itemOf(ep('C')));
    expect(order()).toEqual(['A', 'C', 'D', 'B']);
    expect(useQueueStore.getState().items).toHaveLength(4);
  });

  it('playNowItem inserts AT the cursor (before the current item) and moves the cursor onto it', () => {
    seed(['A', 'B', 'C'], 0);
    useQueueStore.getState().playNowItem(itemOf(ep('D')));
    expect(order()).toEqual(['D', 'A', 'B', 'C']);
    expect(useQueueStore.getState().currentIndex).toBe(0);
    expect(useQueueStore.getState().items[0].episode_id).toBe('D');
  });

  it('playNowItem on an already-queued episode moves it to the cursor without duplicating', () => {
    seed(['A', 'B', 'C'], 0);
    useQueueStore.getState().playNowItem(itemOf(ep('C')));
    expect(order()).toEqual(['C', 'A', 'B']);
    expect(useQueueStore.getState().items).toHaveLength(3);
    expect(useQueueStore.getState().currentIndex).toBe(0);
    expect(useQueueStore.getState().items[0].episode_id).toBe('C');
  });

  it('playNowItem on an empty queue becomes the only item at cursor 0', () => {
    useQueueStore.getState().playNowItem(itemOf(ep('X')));
    expect(order()).toEqual(['X']);
    expect(useQueueStore.getState().currentIndex).toBe(0);
  });

  it('re-queueing the currently playing episode moves it but the cursor follows it', () => {
    seed(['A', 'B', 'C'], 0);
    useQueueStore.getState().playNextItem(itemOf(ep('A')));
    expect(order()).toEqual(['B', 'A', 'C']);
    expect(useQueueStore.getState().currentIndex).toBe(1);
    expect(useQueueStore.getState().items).toHaveLength(3);
  });

  // Adversarial review 2026-11-03 (cross-family validator): the target index is
  // computed BEFORE the twin is removed — a twin sitting before the cursor must
  // not shift the insert one slot too late.
  it('playNextItem of a twin BEFORE the cursor lands right after the cursor, not at the end', () => {
    seed(['A', 'B', 'C', 'D'], 2); // cursor on C
    useQueueStore.getState().playNextItem(itemOf(ep('A')));
    expect(order()).toEqual(['B', 'C', 'A', 'D']);
    expect(useQueueStore.getState().currentIndex).toBe(1);
  });

  it('playNowItem of a twin before the cursor inserts AT the cursor (before the current item)', () => {
    seed(['A', 'B'], 1); // cursor on B
    useQueueStore.getState().playNowItem(itemOf(ep('A')));
    expect(order()).toEqual(['A', 'B']);
    expect(useQueueStore.getState().currentIndex).toBe(0);
    expect(useQueueStore.getState().items[0].episode_id).toBe('A');
  });

  it('a moved twin keeps its queue-item id (React keys / DnD identity survive)', () => {
    seed(['A', 'B', 'C'], 0);
    const idBefore = useQueueStore.getState().items[1].id;
    useQueueStore.getState().addItem(itemOf(ep('B')));
    const moved = useQueueStore.getState().items.find((i) => i.episode_id === 'B');
    expect(moved?.id).toBe(idBefore);
  });
});
