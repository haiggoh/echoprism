// @vitest-environment jsdom
/**
 * D6 (design-decisions.md) — smart links resolve at SEARCH time: results
 * arrive already link-matched (smart_link_id + derived linked_episode_id)
 * and channel-hydrated, so any episode the user picks is already linked.
 * The same resolution applies to the feed (same cards, same choice surface).
 *
 * Discriminant: deleting the link-resolution join from the mock helper fails
 * the linked-result assertions; restoring it passes.
 */
import { describe, it, expect } from 'vitest';
import { mockInvoke } from '../mocks/router';
import type { Episode } from '../types';

describe('mock search resolves smart links at search time (D6)', () => {
  it('attaches smart_link_id + linked_episode_id to a linked search result', async () => {
    // ep-pod-1 ("…RSS is winning again") is linked to ep-video-1 by link-1
    const results = await mockInvoke<Episode[]>('search_episodes', { q: 'rss' });
    const pod = results.find((e) => e.id === 'ep-pod-1');
    expect(pod).toBeDefined();
    expect(pod!.smart_link_id).toBe('link-1');
    expect(pod!.linked_episode_id).toBe('ep-video-1');
  });

  it('leaves unlinked results without link fields', async () => {
    const results = await mockInvoke<Episode[]>('search_episodes', { q: 'bunny' });
    const unlinked = results.find((e) => e.id === 'ep-video-2');
    expect(unlinked).toBeDefined();
    expect(unlinked!.smart_link_id).toBeUndefined();
    expect(unlinked!.linked_episode_id).toBeUndefined();
  });

  it('hydrates the channel on search results (parity with feed)', async () => {
    const results = await mockInvoke<Episode[]>('search_episodes', { q: 'rss' });
    expect(results[0]?.channel?.title).toBe('The Deep Dive Podcast');
  });

  it('resolves links in the feed too (same helper)', async () => {
    const feed = await mockInvoke<Episode[]>('get_feed');
    const video = feed.find((e) => e.id === 'ep-video-1');
    expect(video?.smart_link_id).toBe('link-1');
    expect(video?.linked_episode_id).toBe('ep-pod-1');
  });
});
