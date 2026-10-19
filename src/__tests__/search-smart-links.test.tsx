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

  // D6 canonical case (owner): 'Some More News' (YouTube-native titles) and
  // 'Even More News' (podcast-native titles) are ONE show on two streams —
  // every episode must arrive search-time-linked to its cross-stream twin.
  it('links both title families of a two-stream show in one search (D6)', async () => {
    const results = await mockInvoke<Episode[]>('search_episodes', { q: 'more news' });
    expect(results).toHaveLength(4); // 2 SMN (video) + 2 EMN (podcast)

    const smn = results.find((e) => e.id === 'ep-smn-1');
    expect(smn?.channel?.title).toBe('Some More News');
    expect(smn?.smart_link_id).toBe('link-2');
    expect(smn?.linked_episode_id).toBe('ep-emn-1');

    const emn = results.find((e) => e.id === 'ep-emn-2');
    expect(emn?.channel?.title).toBe('Even More News');
    expect(emn?.smart_link_id).toBe('link-3');
    expect(emn?.linked_episode_id).toBe('ep-smn-2');
  });
});
