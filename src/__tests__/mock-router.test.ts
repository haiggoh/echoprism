/**
 * Mock IPC router — the dev/browser stand-in for the Tauri backend (P3 phase 2,
 * docs/plans/2026-10-18-p3-test-infrastructure.md). The router is pure logic:
 * command name + args -> resolved fixture data. These tests pin the contract
 * the e2e specs (and a plain `npm run dev` browser session) rely on.
 */
import { describe, it, expect, beforeEach } from 'vitest';
import { mockInvoke, resetMockState } from '../mocks/router';
import { mockDb } from '../mocks/data';
import type { Episode, Instance, Queue, QueueItem, StreamInfo, UserPreferences } from '../types';

type QueueWithItems = Queue & { items: QueueItem[] };

describe('mock IPC router', () => {
  beforeEach(() => {
    resetMockState();
  });

  it('rejects unknown commands loudly (a silent undefined would mask typos)', async () => {
    await expect(mockInvoke('no_such_command')).rejects.toThrow(/no_such_command/);
  });

  it('get_feed returns the fixture episodes', async () => {
    const episodes = await mockInvoke<Episode[]>('get_feed');
    expect(episodes).toHaveLength(4);
    const titles = episodes.map((e) => e.title).join('|');
    expect(titles).toContain('video');
    expect(titles).toContain('podcast');
  });

  it('get_episode resolves by id and rejects unknown ids', async () => {
    const episodes = await mockInvoke<Episode[]>('get_feed');
    const first = episodes[0];
    const found = await mockInvoke<Episode>('get_episode', { episodeId: first.id });
    expect(found.id).toBe(first.id);
    await expect(mockInvoke('get_episode', { episodeId: 'missing' })).rejects.toThrow(/missing/);
  });

  it('stream_episode resolves a StreamInfo for the requested format (D1: at play time)', async () => {
    const episodes = await mockInvoke<Episode[]>('get_feed');
    const videoEp = episodes.find((e) => e.video_id) as Episode;
    const info = await mockInvoke<StreamInfo>('stream_episode', { episodeId: videoEp.id, format: 'video' });
    expect(info.url).toBeTruthy();
    expect(info.format).toBe('video');

    const audioInfo = await mockInvoke<StreamInfo>('stream_episode', { episodeId: videoEp.id, format: 'audio' });
    expect(audioInfo.format).toBe('audio');
  });

  it('update_settings persists in memory and get_settings reflects it (D2 radio path)', async () => {
    const before = await mockInvoke<UserPreferences>('get_settings');
    expect(before.card_click_action).toBe('auto'); // D2 default

    await mockInvoke('update_settings', { prefs: { card_click_action: 'queue' } });
    const after = await mockInvoke<UserPreferences>('get_settings');
    expect(after.card_click_action).toBe('queue');
  });

  it('get_queue mirrors queue mutations (add_to_queue, clear)', async () => {
    const episodes = await mockInvoke<Episode[]>('get_feed');
    await mockInvoke('add_to_queue', { episodeId: episodes[0].id });
    let queue = await mockInvoke<QueueWithItems>('get_queue');
    expect(queue.items).toHaveLength(1);

    await mockInvoke('clear_queue');
    queue = await mockInvoke<QueueWithItems>('get_queue');
    expect(queue.items).toHaveLength(0);
  });

  it('fixture database is D1/D2-compliant at the default (no auto-download, auto click)', () => {
    expect(mockDb.preferences.auto_download_wifi).toBe(false);
    expect(mockDb.preferences.card_click_action).toBe('auto');
  });

  it('add_instance registers an instance the onboarding flow can then list (F01-H1 step 2)', async () => {
    const before = await mockInvoke<Instance[]>('list_instances');
    expect(before.some((i) => i.url === 'https://e2e.example.dev')).toBe(false);

    const added = await mockInvoke<Instance>('add_instance', {
      url: 'https://e2e.example.dev',
      instanceType: 'invidious',
    });
    expect(added.url).toBe('https://e2e.example.dev');
    expect(added.type).toBe('invidious');

    const after = await mockInvoke<Instance[]>('list_instances');
    expect(after.some((i) => i.url === 'https://e2e.example.dev')).toBe(true);
  });
});
