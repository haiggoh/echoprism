// @vitest-environment jsdom
/**
 * PlayerProvider media engine — behavioral coverage for the P3 playback engine
 * (commit cd454112). These tests assert the engine against real stores and the
 * real toast surface; only the Tauri `stream_episode` boundary is mocked
 * (jsdom has no media stack and no Tauri shell).
 *
 * Discriminants (per docs/plans/2026-10-18-p3-test-infrastructure.md):
 *  - "restores position on src change" fails if the currentTime-restore line in
 *    PlayerProvider's sync effect is removed (D3/F06 regression).
 *  - "advances the queue on ended" fails if the ended->nextTrack wiring is cut.
 *  - "never resolves a stream for queue-add" fails if any queue-add path starts
 *    playback (D1 regression: adding to the queue must never download/stream).
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { PlayerProvider, usePlayer } from '../components/PlayerProvider';
import { Toaster } from '../components/ui/Toaster';
import { usePlayerStore } from '../store/slices/playerSlice';
import { useQueueStore } from '../store/slices/queueSlice';
import { episodeCommands } from '../hooks/useTauriCommands';
import type { Episode, QueueItem } from '../types';

vi.mock('../hooks/useTauriCommands', () => ({
  episodeCommands: { stream: vi.fn() },
}));

const streamMock = vi.mocked(episodeCommands.stream);

let epCounter = 0;
function makeEpisode(overrides: Partial<Episode> = {}): Episode {
  epCounter += 1;
  return {
    id: `ep-${epCounter}`,
    channel_id: 'ch-1',
    external_id: `ext-${epCounter}`,
    title: `Episode ${epCounter}`,
    video_id: 'yt-video-1',
    is_downloaded: false,
    progress_seconds: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeQueueItem(episode: Episode): Omit<QueueItem, 'id' | 'position'> {
  return {
    queue_id: 'local',
    episode_id: episode.id,
    added_at: new Date().toISOString(),
    source: 'feed',
    play_mode: 'unified',
    episode,
  };
}

/** Renders the provider with a probe that captures the live context API and
 *  registers a real <video> element, plus the real Toaster for toast claims. */
let api: ReturnType<typeof usePlayer>;
let probeVideo: HTMLVideoElement;
let container: HTMLElement;

function renderEngine() {
  function Probe() {
    const ctx = usePlayer();
    api = ctx;
    return <video data-testid="probe-video" ref={ctx.registerVideoElement} />;
  }
  const result = render(
    <PlayerProvider>
      <Probe />
      <Toaster />
    </PlayerProvider>
  );
  container = result.container;
  probeVideo = screen.getByTestId('probe-video') as HTMLVideoElement;
}

function resetStores() {
  usePlayerStore.setState({
    playbackState: null,
    isPlaying: false,
    isAudioMode: false,
    isPip: false,
    volume: 1.0,
    playbackRate: 1.0,
  });
  useQueueStore.setState({
    items: [],
    currentIndex: 0,
    repeatMode: 'off',
    shuffle: false,
    audioOnlyMode: false,
  });
}

beforeAll(() => {
  // jsdom implements no media stack: play() throws "not implemented".
  window.HTMLMediaElement.prototype.play = vi.fn(
    () => Promise.resolve()
  ) as unknown as HTMLMediaElement['play'];
  window.HTMLMediaElement.prototype.pause = vi.fn() as unknown as HTMLMediaElement['pause'];
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  streamMock.mockReset();
  resetStores();
});

afterEach(() => {
  cleanup();
});

describe('PlayerProvider media engine', () => {
  it('resolves the stream at play time and loads it on the active element', async () => {
    const ep = makeEpisode();
    streamMock.mockResolvedValue({ url: 'https://mock/ep.m3u8', format: 'video' });
    renderEngine();

    await act(async () => {
      api.play(ep);
    });

    expect(streamMock).toHaveBeenCalledWith(ep.id, 'video');
    expect(probeVideo.src).toContain('https://mock/ep.m3u8');
    expect(api.isPlaying).toBe(true);
  });

  it('restores position from playback state on src change (D3/F06)', async () => {
    const ep = makeEpisode({ progress_seconds: 42 });
    streamMock.mockResolvedValue({ url: 'https://mock/ep.m3u8', format: 'video' });
    renderEngine();

    await act(async () => {
      api.play(ep);
    });

    expect(probeVideo.currentTime).toBe(42);
  });

  it('switching to audio mode moves the stream to the audio element and keeps position', async () => {
    const ep = makeEpisode({ progress_seconds: 42 });
    streamMock.mockResolvedValue({ url: 'https://mock/ep.m3u8', format: 'video' });
    renderEngine();

    await act(async () => {
      api.play(ep);
    });
    await act(async () => {
      api.setAudioMode(true);
    });

    const audioEl = container.querySelector('audio') as HTMLAudioElement;
    // The stream is reused, not re-resolved (same src, one resolution).
    expect(streamMock).toHaveBeenCalledTimes(1);
    expect(audioEl.src).toContain('https://mock/ep.m3u8');
    expect(audioEl.currentTime).toBe(42);
    expect(probeVideo.paused).toBe(true);
  });

  it('advances the queue on ended and auto-plays the next item', async () => {
    const epA = makeEpisode();
    const epB = makeEpisode();
    useQueueStore.setState({
      items: [makeQueueItem(epA), makeQueueItem(epB)].map((item, position) => ({
        ...item,
        id: `q-${position}`,
        position,
      })) as QueueItem[],
      currentIndex: 0,
    });
    streamMock.mockResolvedValue({ url: 'https://mock/ep.m3u8', format: 'video' });
    renderEngine();

    await act(async () => {
      api.play(epA);
    });
    await act(async () => {
      probeVideo.dispatchEvent(new Event('ended'));
    });

    expect(useQueueStore.getState().currentIndex).toBe(1);
    // Auto-advance: the engine started the next queued episode.
    expect(streamMock).toHaveBeenLastCalledWith(epB.id, 'video');
  });

  it('never resolves a stream or starts playback when an episode is only queued (D1)', async () => {
    const ep = makeEpisode();
    renderEngine();

    await act(async () => {
      useQueueStore.getState().addItem(makeQueueItem(ep));
    });
    await act(async () => {}); // flush any (wrongly) scheduled promises

    expect(streamMock).not.toHaveBeenCalled();
    expect(api.isPlaying).toBe(false);
    // Note: currentEpisode MAY reflect the queued item — the context falls back
    // to items[currentIndex].episode by design (restore-last-position), and a
    // loaded-but-idle episode is not playback.
  });

  it('stream rejection pauses and surfaces a playback-unavailable toast', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const ep = makeEpisode();
      streamMock.mockRejectedValue(new Error('no healthy instance'));
      renderEngine();

      await act(async () => {
        api.play(ep);
      });

      expect(api.isPlaying).toBe(false);
      expect(await screen.findByText('Playback unavailable')).toBeTruthy();
      // Dismiss the toast so it cannot leak into later tests.
      await act(async () => {
        vi.runAllTimers();
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('element error pauses and surfaces a stream-error toast', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const ep = makeEpisode();
      streamMock.mockResolvedValue({ url: 'https://mock/ep.m3u8', format: 'video' });
      renderEngine();

      await act(async () => {
        api.play(ep);
      });
      await act(async () => {
        probeVideo.dispatchEvent(new Event('error'));
      });

      expect(api.isPlaying).toBe(false);
      expect(screen.getByText('Stream error')).toBeTruthy();
      await act(async () => {
        vi.runAllTimers();
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('load(paused) sets the episode without streaming; play then resolves and starts (D2 load_paused)', async () => {
    const ep = makeEpisode({ progress_seconds: 30 });
    streamMock.mockResolvedValue({ url: 'https://mock/ep.m3u8', format: 'video' });
    renderEngine();

    await act(async () => {
      api.load(ep, { paused: true });
    });
    await act(async () => {}); // flush: loading paused must not resolve a stream

    expect(streamMock).not.toHaveBeenCalled();
    expect(api.currentEpisode?.id).toBe(ep.id);
    expect(api.isPlaying).toBe(false);

    await act(async () => {
      api.togglePlay();
    });

    expect(streamMock).toHaveBeenCalledWith(ep.id, 'video');
    expect(probeVideo.src).toContain('https://mock/ep.m3u8');
    expect(api.isPlaying).toBe(true);
  });

  it('keeps volume and rate in sync across both elements', async () => {
    streamMock.mockResolvedValue({ url: 'https://mock/ep.m3u8', format: 'video' });
    renderEngine();

    await act(async () => {
      api.setVolume(0.5);
      api.setPlaybackRate(1.5);
    });

    const audioEl = container.querySelector('audio') as HTMLAudioElement;
    expect(probeVideo.volume).toBe(0.5);
    expect(audioEl.volume).toBe(0.5);
    expect(probeVideo.playbackRate).toBe(1.5);
    expect(audioEl.playbackRate).toBe(1.5);
  });

  // F03 e2e finding: when the engine switches elements (audio -> video once
  // PlayerScreen registers its <video>), pausing the old element rejects its
  // in-flight play() promise with AbortError. That is our own pause, not a
  // playback failure — it must not flip isPlaying off and kill the switch.
  it('keeps playing when our own pause() aborts the pending play() (AbortError)', async () => {
    const ep = makeEpisode();
    streamMock.mockResolvedValue({ url: 'https://mock/ep.m3u8', format: 'video' });
    renderEngine();

    const realPlay = window.HTMLMediaElement.prototype.play;
    window.HTMLMediaElement.prototype.play = vi.fn(() =>
      Promise.reject(
        new DOMException(
          'The play() request was interrupted by a call to pause(). https://goo.gl/LdLk22',
          'AbortError'
        )
      )
    ) as unknown as HTMLMediaElement['play'];
    try {
      await act(async () => {
        api.play(ep);
      });
      expect(api.isPlaying).toBe(true);
    } finally {
      window.HTMLMediaElement.prototype.play = realPlay;
    }
  });

  it('still stops on a genuine play() rejection (NotAllowedError)', async () => {
    const ep = makeEpisode();
    streamMock.mockResolvedValue({ url: 'https://mock/ep.m3u8', format: 'video' });
    renderEngine();

    const realPlay = window.HTMLMediaElement.prototype.play;
    window.HTMLMediaElement.prototype.play = vi.fn(() =>
      Promise.reject(new DOMException('play() can only be initiated by a user gesture.', 'NotAllowedError'))
    ) as unknown as HTMLMediaElement['play'];
    try {
      await act(async () => {
        api.play(ep);
      });
      expect(api.isPlaying).toBe(false);
    } finally {
      window.HTMLMediaElement.prototype.play = realPlay;
    }
  });

  // F04 e2e finding: a podcast episode has no video capability, so asking the
  // backend for format 'video' fails (mock: "has no video stream") and the
  // catch path kills playback with a toast. The engine must pick the format
  // from the episode's own capability, not from the global audio-mode toggle.
  it('resolves AUDIO for podcast episodes even when audio mode is off', async () => {
    const ep = makeEpisode({ video_id: undefined, audio_url: 'https://mock/ep.wav' });
    streamMock.mockResolvedValue({ url: 'https://mock/ep.wav', format: 'audio' });
    renderEngine();

    await act(async () => {
      api.play(ep);
    });

    expect(streamMock).toHaveBeenCalledWith(ep.id, 'audio');
    expect(api.isPlaying).toBe(true);
  });
});
