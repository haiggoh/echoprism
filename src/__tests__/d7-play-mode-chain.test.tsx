// @vitest-environment jsdom
/**
 * D7 (design-decisions.md) — the consultation chain that turns a card click
 * into a default play mode, in precedence order:
 *
 *   1. a matching per-channel play-mode rule (first match wins; the backend
 *      returns rules priority-ordered)
 *   2. the channel's format_preference ('both' = no override)
 *   3. no override (undefined) — the engine then applies its own defaults
 *      (global audio toggle, capability fallback)
 *
 * resolveDefaultPlayMode is pure and tested directly; the integration test
 * proves handleCardClick actually consults it before play() (observable via
 * the resolved stream format). Discriminant: deleting the rule consultation
 * from useEpisodePlay fails the integration test; permuting the rule list
 * fails the ordering test.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PlayerProvider } from '../components/PlayerProvider';
import { Toaster } from '../components/ui/Toaster';
import { useEpisodePlay, resolveDefaultPlayMode } from '../hooks/useEpisodePlay';
import { usePlayerStore } from '../store/slices/playerSlice';
import {
  episodeCommands,
  settingsCommands,
  playModeRuleCommands,
  channelCommands,
} from '../hooks/useTauriCommands';
import type { Channel, Episode, PlayModeRule } from '../types';

vi.mock('../hooks/useTauriCommands', () => ({
  episodeCommands: { stream: vi.fn() },
  settingsCommands: { get: vi.fn() },
  playModeRuleCommands: { list: vi.fn() },
  channelCommands: { list: vi.fn() },
}));

const streamMock = vi.mocked(episodeCommands.stream);
const rulesMock = vi.mocked(playModeRuleCommands.list);
const channelsMock = vi.mocked(channelCommands.list);
const settingsMock = vi.mocked(settingsCommands.get);

function makeEpisode(overrides: Partial<Episode> = {}): Episode {
  return {
    id: 'ep-smn-1',
    channel_id: 'ch-3',
    external_id: 'smn-vid-001',
    title: 'Some More News: Why Billionaires Should Not Exist',
    video_id: 'smn-vid-001',
    is_downloaded: false,
    progress_seconds: 0,
    created_at: '2026-10-18T00:00:00Z',
    updated_at: '2026-10-18T00:00:00Z',
    ...overrides,
  };
}

const rule = (overrides: Partial<PlayModeRule>): PlayModeRule => ({
  id: 'rule-x',
  channel_id: 'ch-3',
  title_pattern: 'Some More News',
  play_mode: 'video',
  priority: 0,
  created_at: '2026-10-18T00:00:00Z',
  updated_at: '2026-10-18T00:00:00Z',
  ...overrides,
});

const channel = (overrides: Partial<Channel>): Channel => ({
  id: 'ch-3',
  user_id: 'current-user',
  external_id: 'UC-mock',
  title: 'Some More News',
  is_subscribed: true,
  subscribed_at: '2026-10-18T00:00:00Z',
  notifications_enabled: false,
  format_preference: 'both',
  type: 'video',
  created_at: '2026-10-18T00:00:00Z',
  updated_at: '2026-10-18T00:00:00Z',
  ...overrides,
});

describe('resolveDefaultPlayMode (D7 chain, pure)', () => {
  it('a matching rule wins (SMN → video, EMN → audio)', () => {
    const rules = [rule({}), rule({ id: 'r2', channel_id: 'ch-4', title_pattern: 'Even More News', play_mode: 'audio' })];
    expect(resolveDefaultPlayMode(makeEpisode({ title: 'Some More News: X' }), rules, [])).toBe('video');
    expect(
      resolveDefaultPlayMode(
        makeEpisode({ id: 'ep-emn-1', channel_id: 'ch-4', title: 'Even More News: X', video_id: undefined }),
        rules,
        []
      )
    ).toBe('audio');
  });

  it('rules are channel-scoped: another channel’s matching pattern does not apply', () => {
    const rules = [rule({ title_pattern: 'News', play_mode: 'video' })];
    // Same title family, different channel → no rule match.
    expect(
      resolveDefaultPlayMode(makeEpisode({ channel_id: 'ch-2', title: 'News: something' }), rules, [])
    ).toBeUndefined();
  });

  it('first matching rule wins (evaluation order = list order)', () => {
    const rules = [
      rule({ title_pattern: 'Some More', play_mode: 'video' }),
      rule({ title_pattern: 'Some More News', play_mode: 'audio' }),
    ];
    expect(resolveDefaultPlayMode(makeEpisode(), rules, [])).toBe('video');
  });

  it('no rule match falls back to the channel format_preference', () => {
    expect(
      resolveDefaultPlayMode(makeEpisode({ title: 'Unrelated special' }), [rule({})], [
        channel({ format_preference: 'audio' }),
      ])
    ).toBe('audio');
    expect(
      resolveDefaultPlayMode(makeEpisode({ title: 'Unrelated special' }), [rule({})], [
        channel({ format_preference: 'video' }),
      ])
    ).toBe('video');
  });

  it("format_preference 'both' is no override; no channel row at all is no override", () => {
    expect(
      resolveDefaultPlayMode(makeEpisode({ title: 'Unrelated special' }), [rule({})], [
        channel({ format_preference: 'both' }),
      ])
    ).toBeUndefined();
    expect(resolveDefaultPlayMode(makeEpisode({ title: 'Unrelated special' }), [], [])).toBeUndefined();
  });
});

describe('handleCardClick consults the D7 chain (integration)', () => {
  beforeAll(() => {
    window.HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve()) as unknown as HTMLMediaElement['play'];
    window.HTMLMediaElement.prototype.pause = vi.fn() as unknown as HTMLMediaElement['pause'];
    (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    streamMock.mockReset();
    streamMock.mockResolvedValue({ url: 'https://mock/ep.m3u8', format: 'video' });
    rulesMock.mockReset();
    channelsMock.mockReset();
    settingsMock.mockReset();
    settingsMock.mockResolvedValue({
      user_id: 'current-user',
      default_format: 'unified',
      queue_behavior: 'play_next',
      audio_only_default: false,
      auto_download_wifi: false,
      sponsorblock_enabled: true,
      sponsorblock_categories: [],
      keyboard_shortcuts_enabled: true,
      theme: 'system',
      cross_device_sync_enabled: false,
      card_click_action: 'play_now', // isolate the play-now path from D2 auto
      updated_at: '2026-10-18T00:00:00Z',
    });
    usePlayerStore.setState({
      playbackState: null,
      isPlaying: false,
      isAudioMode: false,
      isPip: false,
      volume: 1.0,
      playbackRate: 1.0,
    });
  });

  afterEach(() => {
    cleanup();
  });

  function ClickProbe({ episode }: { episode: Episode }) {
    const { handleCardClick } = useEpisodePlay();
    return <button onClick={() => handleCardClick(episode)}>click-card</button>;
  }

  async function renderAndClick(episode: Episode) {
    cleanup(); // this test renders twice in one body — drop the previous tree
    // The player store is module-global: the previous scenario's isPlaying
    // must not leak into this one (it would flip D2 'auto' to queue-add).
    usePlayerStore.setState({
      playbackState: null,
      isPlaying: false,
      isAudioMode: false,
      isPip: false,
      volume: 1.0,
      playbackRate: 1.0,
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <PlayerProvider>
            <ClickProbe episode={episode} />
            <Toaster />
          </PlayerProvider>
        </MemoryRouter>
      </QueryClientProvider>
    );
    // The click must see the RESOLVED rule/channel/preferences queries. A
    // single act flush races react-query's fetch — waiting on the fetch calls
    // (then flushing) is what removes the timing race that made earlier
    // integration passes coincidental.
    await waitFor(() => {
      expect(rulesMock).toHaveBeenCalled();
      expect(channelsMock).toHaveBeenCalled();
      expect(settingsMock).toHaveBeenCalled();
    });
    await act(async () => {}); // flush query resolutions into component state
    fireEvent.click(screen.getByText('click-card'));
    await act(async () => {}); // flush play()
  }

  it('an SMN-titled episode plays VIDEO; an EMN-titled episode plays AUDIO', async () => {
    rulesMock.mockResolvedValue([
      rule({}),
      rule({ id: 'r2', channel_id: 'ch-4', title_pattern: 'Even More News', play_mode: 'audio' }),
    ]);
    channelsMock.mockResolvedValue([]);

    await renderAndClick(makeEpisode());
    expect(streamMock).toHaveBeenLastCalledWith('ep-smn-1', 'video');

    await renderAndClick(
      makeEpisode({ id: 'ep-emn-1', channel_id: 'ch-4', title: 'Even More News: Why Billionaires', video_id: undefined })
    );
    expect(streamMock).toHaveBeenLastCalledWith('ep-emn-1', 'audio');
  });

  // The DISCRIMINATING case: a rule that CONFLICTS with the engine default.
  // A video-capable EMN-titled episode would stream 'video' by default, but
  // the 'audio' rule must win (owner: "even more news titled episodes play
  // audio only by default" — even if a video version exists). Bypassing the
  // chain fails exactly this assertion; the canonical case above cannot
  // (its outcomes coincide with the engine defaults).
  it('an audio-family rule overrides the video default of a video-capable episode', async () => {
    rulesMock.mockResolvedValue([
      rule({ id: 'r2', channel_id: 'ch-4', title_pattern: 'Even More News', play_mode: 'audio' }),
    ]);
    channelsMock.mockResolvedValue([]);

    await renderAndClick(
      makeEpisode({
        id: 'ep-emn-vid',
        channel_id: 'ch-4',
        title: 'Even More News: Video Edition',
        video_id: 'emn-vid-001',
      })
    );
    expect(streamMock).toHaveBeenLastCalledWith('ep-emn-vid', 'audio');
  });

  it('without rules, a channel format_preference video default applies', async () => {
    rulesMock.mockResolvedValue([]);
    channelsMock.mockResolvedValue([channel({ format_preference: 'video' })]);

    await renderAndClick(
      makeEpisode({ id: 'ep-other', channel_id: 'ch-9', title: 'Special report', video_id: 'vid-9' })
    );
    expect(streamMock).toHaveBeenLastCalledWith('ep-other', 'video');
  });

  it('with neither a rule nor a channel default, no override is sent (engine default)', async () => {
    rulesMock.mockResolvedValue([]);
    channelsMock.mockResolvedValue([channel({ format_preference: 'both' })]);

    await renderAndClick(makeEpisode());
    // No mode argument → the engine applies its own defaults (global toggle).
    expect(streamMock).toHaveBeenLastCalledWith('ep-smn-1', 'video');
  });
});
