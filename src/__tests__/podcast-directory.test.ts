/**
 * 2e: the podcast directory reaches the UI — search_podcasts (iTunes
 * backend), subscribe_podcast (one-transaction persist) and the per-channel
 * get_feed filter the subscribe flow depends on. Mock semantics MIRROR the
 * Rust commands (the browser/e2e world must exercise the same contract):
 * search filters by term across title/author/genres, subscribe persists
 * channel + episodes and is idempotent on the feed URL, and an unknown feed
 * URL REJECTS (the real backend fetches any URL; the mock has no fetcher and
 * must fail honestly rather than invent a subscription).
 *
 * State is asserted black-box through mockInvoke only — the mock db is
 * module-private by design (fixtures stay pristine; resetMockState clones).
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mockInvoke, resetMockState } from '../mocks/router';
import type { Episode, PodcastSearchResult, SubscribedPodcast } from '../types';

beforeEach(() => resetMockState());

describe('2e: mock podcast directory mirrors the Rust commands', () => {
  it('search_podcasts filters fixtures by term across title/author/genres', async () => {
    const signal = await mockInvoke<PodcastSearchResult[]>('search_podcasts', { term: 'signal' });
    expect(signal).toHaveLength(1);
    expect(signal[0].title).toBe('The Weekly Signal');
    expect(signal[0].feed_url).toBe('https://feeds.example/weekly-signal.xml');

    // Case-insensitive, and genres participate.
    const upper = await mockInvoke<PodcastSearchResult[]>('search_podcasts', { term: 'WEEKLY' });
    expect(upper.map((r) => r.title)).toContain('The Weekly Signal');
    const byGenre = await mockInvoke<PodcastSearchResult[]>('search_podcasts', { term: 'software' });
    expect(byGenre.map((r) => r.title)).toContain('Compiler Hours');

    const none = await mockInvoke<PodcastSearchResult[]>('search_podcasts', { term: 'zzz-no-match' });
    expect(none).toEqual([]);
  });

  it('subscribe persists channel + episodes; get_feed(channelId) lists exactly them', async () => {
    const results = await mockInvoke<PodcastSearchResult[]>('search_podcasts', { term: 'signal' });
    const sub = await mockInvoke<SubscribedPodcast>('subscribe_podcast', {
      feedUrl: results[0].feed_url,
      title: results[0].title,
    });
    expect(sub.new_episodes).toBe(2);
    expect(sub.channel_id).toBeTruthy();
    expect(sub.title).toBe('The Weekly Signal');

    const eps = await mockInvoke<Episode[]>('get_feed', { params: { channelId: sub.channel_id } });
    expect(eps).toHaveLength(2);
    expect(eps.every((e) => e.channel_id === sub.channel_id)).toBe(true);
    // Enclosures survive (playability parity with the Rust-persisted rows).
    expect(eps.every((e) => typeof e.audio_url === 'string' && e.audio_url.length > 0)).toBe(true);
  });

  it('resubscribing is idempotent: 0 new episodes, same channel, no duplicates', async () => {
    const first = await mockInvoke<SubscribedPodcast>('subscribe_podcast', {
      feedUrl: 'https://feeds.example/weekly-signal.xml',
    });
    const again = await mockInvoke<SubscribedPodcast>('subscribe_podcast', {
      feedUrl: 'https://feeds.example/weekly-signal.xml',
    });
    expect(again.new_episodes).toBe(0);
    expect(again.channel_id).toBe(first.channel_id);

    const eps = await mockInvoke<Episode[]>('get_feed', { params: { channelId: first.channel_id } });
    expect(eps).toHaveLength(2); // no duplicate rows after re-subscribe
  });

  it('unknown feed URL rejects (the mock has no fetcher — fail honestly)', async () => {
    await expect(
      mockInvoke('subscribe_podcast', { feedUrl: 'https://feeds.example/unknown.xml' }),
    ).rejects.toThrow(/unknown podcast feed/);
  });

  it('empty feed URL rejects (mirrors the Rust guard)', async () => {
    await expect(mockInvoke('subscribe_podcast', { feedUrl: '   ' })).rejects.toThrow(/feed URL required/);
  });

  it('a VIDEO request on a podcast-shaped episode resolves its enclosure (Phase A parity)', async () => {
    // ep-pod-1 has audio_url and no video_id — the shape a real subscribe
    // stores. The Rust enclosure path (Phase A) returns the enclosure even
    // for a video request; the mock must agree or e2e lies about the shell.
    const info = await mockInvoke<import('../types').StreamInfo>('stream_episode', {
      episodeId: 'ep-pod-1',
      format: 'video',
    });
    expect(info.url).toBe('/mock-media/ep-pod-1.wav');
    expect(info.format).toBe('audio');
  });

  it('get_feed keeps the channel-TYPE filter semantics (parity with the Rust JOIN)', async () => {
    const pods = await mockInvoke<Episode[]>('get_feed', { params: { type: 'podcast' } });
    expect(pods.length).toBeGreaterThan(0);
    // Derived from the fixtures: TWO podcast channels exist (ch-2 Deep Dive,
    // ch-4 Even More News) — every returned row must belong to one of them,
    // and no video-channel episode may leak in.
    const podcastChannelIds = ['ch-2', 'ch-4'];
    expect(pods.every((e) => podcastChannelIds.includes(e.channel_id))).toBe(true);
    const videoIds = await mockInvoke<Episode[]>('get_feed', { params: { type: 'video' } });
    expect(videoIds.every((e) => !podcastChannelIds.includes(e.channel_id))).toBe(true);
    // 'queue' is not a channel type — the real backend returns nothing.
    const queues = await mockInvoke<Episode[]>('get_feed', { params: { type: 'queue' } });
    expect(queues).toEqual([]);
  });
});
