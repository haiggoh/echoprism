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
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '../components/ui/Toaster';
import { usePlayerStore } from '../store/slices/playerSlice';
import { useQueueStore } from '../store/slices/queueSlice';
import { episodeCommands } from '../hooks/useTauriCommands';
import type { Episode, QueueItem } from '../types';

vi.mock('../hooks/useTauriCommands', () => ({
  episodeCommands: { stream: vi.fn() },
  // Phase (live-test pass): the resolve effect now also records history —
  // the engine tests must not break on it (and can assert it).
  historyCommands: { record: vi.fn().mockResolvedValue(undefined) },
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
  // PlayerProvider reads the play-mode chain out of the shared react-query
  // cache on queue advance (D7/Phase 5), so it needs the same provider the real
  // app tree has (main.tsx). A fresh client per render keeps the cache cold.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const result = render(
    <QueryClientProvider client={client}>
      <PlayerProvider>
        <Probe />
        <Toaster />
      </PlayerProvider>
    </QueryClientProvider>
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
    // Live-test pass: a successful resolve RECORDS history (one row per
    // actual playback start — every source, one hook).
    const { historyCommands } = await import('../hooks/useTauriCommands');
    expect(vi.mocked(historyCommands.record)).toHaveBeenCalledWith(ep.id);
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

  // F05 review #7: repeat 'one' was pinned only at the slice ("stays on
  // current"), but staying writes no state, so nothing restarted the ended
  // element and playback simply stopped. Discriminant: dropping the repeat-one
  // branch from the ended handler leaves play() uncalled and fails this.
  it("repeat 'one' restarts the same episode on ended, mid-queue too", async () => {
    const epA = makeEpisode();
    const epB = makeEpisode();
    useQueueStore.setState({
      items: [makeQueueItem(epA), makeQueueItem(epB)].map((item, position) => ({
        ...item,
        id: `q-${position}`,
        position,
      })) as QueueItem[],
      currentIndex: 0,
      repeatMode: 'one',
    });
    streamMock.mockResolvedValue({ url: 'https://mock/ep.m3u8', format: 'video' });
    renderEngine();

    await act(async () => {
      api.play(epA);
    });
    const playSpy = vi.mocked(window.HTMLMediaElement.prototype.play);
    playSpy.mockClear();
    probeVideo.currentTime = 42;
    await act(async () => {
      probeVideo.dispatchEvent(new Event('ended'));
    });

    expect(useQueueStore.getState().currentIndex).toBe(0);
    expect(probeVideo.currentTime).toBe(0);
    expect(playSpy).toHaveBeenCalled();
    expect(api.isPlaying).toBe(true);
    // Same element restarted: no new stream resolution for B (or A).
    expect(streamMock).toHaveBeenCalledTimes(1);
  });

  // F05 review #6 at the engine: dragging the PLAYING item (or an item across
  // it) must not change what plays. The old toIndex-keyed reorder math moved
  // the cursor onto a different episode and the auto-advance effect played it.
  it('reordering around the playing item never switches or stops playback', async () => {
    const [epA, epB, epC] = [makeEpisode(), makeEpisode(), makeEpisode()];
    const queueItems = [makeQueueItem(epA), makeQueueItem(epB), makeQueueItem(epC)].map(
      (item, position) => ({ ...item, id: `q-${position}`, position })
    ) as QueueItem[];
    useQueueStore.setState({ items: queueItems, currentIndex: 1 });
    streamMock.mockResolvedValue({ url: 'https://mock/ep.m3u8', format: 'video' });
    renderEngine();

    await act(async () => {
      api.play(epB);
    });
    await act(async () => {
      useQueueStore.getState().reorderItems(1, 0); // drag playing B to the top
    });
    await act(async () => {
      useQueueStore.getState().reorderItems(1, 2); // drag A across B's slot
    });

    const { items, currentIndex } = useQueueStore.getState();
    expect(items[currentIndex]?.episode?.id).toBe(epB.id);
    expect(streamMock).toHaveBeenCalledTimes(1);
    expect(api.isPlaying).toBe(true);
  });

  // F05 review #4, pinned as a DECISION: emptying the queue while playing
  // stops playback (the cleared episode is gone from the queue, so continuing
  // to play it would leave the player showing nothing the queue knows about).
  it('clearing the queue while playing stops playback', async () => {
    const epA = makeEpisode();
    useQueueStore.setState({
      items: [makeQueueItem(epA)].map((item, position) => ({
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
    expect(api.isPlaying).toBe(true);
    await act(async () => {
      useQueueStore.getState().clearQueue();
    });

    expect(api.isPlaying).toBe(false);
  });

  // F05-N1 (replica/test-plan.md): removing the PLAYING item must advance
  // playback to the (new) current episode — the clamp in removeItem leaves
  // currentIndex pointing at the next item, and the engine must notice even
  // though the index NUMBER did not change. Discriminant: reverting the
  // auto-advance effect to index-only comparison fails this (the removed
  // episode's already-resolved stream keeps playing) and only this.
  it('removing the playing item starts the next one (F05-N1)', async () => {
    const epA = makeEpisode();
    const epB = makeEpisode();
    const queueItems = [makeQueueItem(epA), makeQueueItem(epB)].map((item, position) => ({
      ...item,
      id: `q-${position}`,
      position,
    })) as QueueItem[];
    useQueueStore.setState({ items: queueItems, currentIndex: 0 });
    streamMock.mockResolvedValue({ url: 'https://mock/ep.m3u8', format: 'video' });
    renderEngine();

    await act(async () => {
      api.play(epA);
    });
    expect(streamMock).toHaveBeenLastCalledWith(epA.id, 'video');

    await act(async () => {
      useQueueStore.getState().removeItem(queueItems[0].id);
    });

    // The queue clamped to the next item; the engine plays it.
    expect(useQueueStore.getState().currentIndex).toBe(0);
    expect(useQueueStore.getState().items[0]?.episode?.id).toBe(epB.id);
    expect(streamMock).toHaveBeenLastCalledWith(epB.id, 'video');
    expect(api.isPlaying).toBe(true);
  });

  it('removing the playing LAST item falls back to the previous remaining one', async () => {
    const epA = makeEpisode();
    const epB = makeEpisode();
    const queueItems = [makeQueueItem(epA), makeQueueItem(epB)].map((item, position) => ({
      ...item,
      id: `q-${position}`,
      position,
    })) as QueueItem[];
    useQueueStore.setState({ items: queueItems, currentIndex: 1 });
    streamMock.mockResolvedValue({ url: 'https://mock/ep.m3u8', format: 'video' });
    renderEngine();

    await act(async () => {
      api.play(epB);
    });
    await act(async () => {
      useQueueStore.getState().removeItem(queueItems[1].id);
    });

    // No next item exists: the clamp lands on the previous remaining one.
    expect(useQueueStore.getState().currentIndex).toBe(0);
    expect(streamMock).toHaveBeenLastCalledWith(epA.id, 'video');
    expect(api.isPlaying).toBe(true);
  });

  it('removing a non-playing item does not restart or interrupt playback', async () => {
    const epA = makeEpisode();
    const epB = makeEpisode();
    const queueItems = [makeQueueItem(epA), makeQueueItem(epB)].map((item, position) => ({
      ...item,
      id: `q-${position}`,
      position,
    })) as QueueItem[];
    useQueueStore.setState({ items: queueItems, currentIndex: 0 });
    streamMock.mockResolvedValue({ url: 'https://mock/ep.m3u8', format: 'video' });
    renderEngine();

    await act(async () => {
      api.play(epA);
    });
    await act(async () => {
      useQueueStore.getState().removeItem(queueItems[1].id);
    });

    // epA keeps playing: no second resolution, playback state untouched.
    expect(streamMock).toHaveBeenCalledTimes(1);
    expect(api.isPlaying).toBe(true);
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
      // Synchronous assert after an act flush (the sibling test's pattern):
      // findByText polled while shouldAdvanceTime let the mocked 5s toast
      // auto-dismiss advance with REAL elapsed time — any thread stall
      // longer than the toast's lifetime removed it before the poll saw it.
      await act(async () => {}); // flush the rejection → addToast pipeline
      expect(screen.getByText('Playback unavailable')).toBeTruthy();
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

  // D7 contract pins (design-decisions.md): the per-call mode override wins
  // over the global audio toggle, but can never conjure a capability the
  // episode lacks — and it must NOT rewrite the user's audio toggle (plan:
  // "override affects initial choice only; audio-only toggle still governs
  // subsequent switches"). Mutation checks: deleting the mode ternary fails
  // the first; restoring the old setAudioMode(wantAudio) in play() fails the
  // first two; removing the capability fallback in the resolve effect fails
  // the third.
  it("play(ep, 'audio') overrides the video default WITHOUT rewriting the audio toggle (D7)", async () => {
    const ep = makeEpisode();
    streamMock.mockResolvedValue({ url: 'https://mock/ep.wav', format: 'audio' });
    renderEngine();

    await act(async () => {
      api.play(ep, 'audio');
    });

    // The stream honors the override…
    expect(streamMock).toHaveBeenCalledWith(ep.id, 'audio');
    // …but the user's toggle (off) is untouched — it still governs the next
    // override-less play.
    expect(api.isAudioMode).toBe(false);
    expect(api.isPlaying).toBe(true);
  });

  it('an override-less play after an overridden one uses the toggle again (no leak)', async () => {
    streamMock.mockResolvedValue({ url: 'https://mock/ep.m3u8', format: 'video' });
    renderEngine();

    const epA = makeEpisode();
    const epB = makeEpisode();
    await act(async () => {
      api.play(epA, 'audio'); // D7 chain mode: this episode plays audio
    });
    expect(streamMock).toHaveBeenLastCalledWith(epA.id, 'audio');

    await act(async () => {
      api.play(epB); // no chain mode: the user's toggle (off) decides
    });

    expect(streamMock).toHaveBeenLastCalledWith(epB.id, 'video');
    expect(api.isAudioMode).toBe(false);
  });

  it("play(ep, 'video') on a podcast-only episode falls back to audio (capability floor)", async () => {
    const ep = makeEpisode({ video_id: undefined, audio_url: 'https://mock/ep.wav' });
    streamMock.mockResolvedValue({ url: 'https://mock/ep.wav', format: 'audio' });
    renderEngine();

    await act(async () => {
      api.play(ep, 'video');
    });

    expect(streamMock).toHaveBeenCalledWith(ep.id, 'audio');
    expect(api.isPlaying).toBe(true);
  });
});
