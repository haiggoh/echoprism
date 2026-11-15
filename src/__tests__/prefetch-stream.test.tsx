// @vitest-environment jsdom
/**
 * Task 5: frontend pre-resolve triggers (plan: browser-fast playback start).
 * - usePrefetchStream: hover dwell 400 ms → prefetch_stream(origin 'hover');
 *   leave before the dwell cancels; podcasts (no video_id) never prefetch.
 * - prefetch key includes the CURRENT mode (audio-only on → format 'audio').
 * - upcomingQueueEpisodes: next n after the cursor, wraps on repeat 'all',
 *   empty on shuffle.
 * - media error invalidates the cache entry before the re-resolve.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { usePrefetchStream, upcomingQueueEpisodes, PREFETCH_DWELL_MS } from '../hooks/usePrefetchStream';
import { PlayerProvider, usePlayer } from '../components/PlayerProvider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from '../components/ui/Toaster';
import { usePlayerStore } from '../store/slices/playerSlice';
import { useQueueStore } from '../store/slices/queueSlice';
import { episodeCommands } from '../hooks/useTauriCommands';
import type { Episode, QueueItem } from '../types';

vi.mock('../hooks/useTauriCommands', () => ({
  smartLinkCommands: { match: vi.fn().mockResolvedValue({ matched_count: 0 }) },
  episodeCommands: {
    stream: vi.fn(),
    prefetch: vi.fn().mockResolvedValue(undefined),
    invalidate: vi.fn().mockResolvedValue(undefined),
  },
  previewCommands: { frames: vi.fn().mockResolvedValue(null) },
  historyCommands: { record: vi.fn().mockResolvedValue(undefined) },
  settingsCommands: {
    get: vi.fn().mockResolvedValue({ audio_only_default: false }),
    update: vi.fn().mockResolvedValue(undefined),
  },
}));

const streamMock = vi.mocked(episodeCommands.stream);
const prefetchMock = vi.mocked(episodeCommands.prefetch);
const invalidateMock = vi.mocked(episodeCommands.invalidate);

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
  } as Episode;
}

function makeItem(episode: Episode): QueueItem {
  return {
    id: `q-${episode.id}`,
    queue_id: 'local',
    episode_id: episode.id,
    position: 0,
    added_at: new Date().toISOString(),
    source: 'feed',
    play_mode: 'unified',
    episode,
  } as QueueItem;
}

/** Minimal component exposing the hook's pointer handlers. */
function Probe({ episode }: { episode: Episode }) {
  const h = usePrefetchStream(episode);
  return <div data-testid="probe" onPointerEnter={h.onPointerEnter} onPointerLeave={h.onPointerLeave} />;
}

beforeAll(() => {
  window.HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve()) as unknown as HTMLMediaElement['play'];
  window.HTMLMediaElement.prototype.pause = vi.fn() as unknown as HTMLMediaElement['pause'];
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
});

beforeEach(() => {
  // Fake timers are enabled per-test (the dwell tests need them; the engine
  // tests need real timers for waitFor).
  streamMock.mockReset();
  prefetchMock.mockReset().mockResolvedValue(undefined);
  invalidateMock.mockReset().mockResolvedValue(undefined);
  usePlayerStore.setState({
    playbackState: null,
    isPlaying: false,
    isAudioMode: false,
    isPip: false,
    volume: 1.0,
    playbackRate: 1.0,
  });
  useQueueStore.setState({ items: [], currentIndex: 0, repeatMode: 'off', shuffle: false });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('usePrefetchStream hover dwell', () => {
  it('hover_dwell_prefetches_after_400ms_not_before', () => {
    vi.useFakeTimers();
    const ep = makeEpisode();
    render(<Probe episode={ep} />);
    const el = screen.getByTestId('probe');
    fireEvent.pointerEnter(el);
    act(() => {
      vi.advanceTimersByTime(PREFETCH_DWELL_MS - 1);
    });
    expect(prefetchMock).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(prefetchMock).toHaveBeenCalledTimes(1);
    expect(prefetchMock).toHaveBeenCalledWith(ep.id, 'video', 'hover');
  });

  it('pointer_leave_before_dwell_cancels', () => {
    vi.useFakeTimers();
    const ep = makeEpisode();
    render(<Probe episode={ep} />);
    const el = screen.getByTestId('probe');
    fireEvent.pointerEnter(el);
    act(() => {
      vi.advanceTimersByTime(PREFETCH_DWELL_MS - 100);
    });
    fireEvent.pointerLeave(el);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(prefetchMock).not.toHaveBeenCalled();
  });

  it('podcast_card_hover_never_prefetches', () => {
    vi.useFakeTimers();
    const ep = makeEpisode({ video_id: undefined, audio_url: 'https://cdn.example.com/ep.mp3' });
    render(<Probe episode={ep} />);
    const el = screen.getByTestId('probe');
    fireEvent.pointerEnter(el);
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(prefetchMock).not.toHaveBeenCalled();
  });

  it('prefetch_key_includes_mode (audio-only on → format audio)', () => {
    vi.useFakeTimers();
    usePlayerStore.setState({ isAudioMode: true });
    const ep = makeEpisode();
    render(<Probe episode={ep} />);
    fireEvent.pointerEnter(screen.getByTestId('probe'));
    act(() => {
      vi.advanceTimersByTime(PREFETCH_DWELL_MS + 50);
    });
    expect(prefetchMock).toHaveBeenCalledWith(ep.id, 'audio', 'hover');
  });
});

describe('upcomingQueueEpisodes', () => {
  const eps = [makeEpisode({ id: 'a', video_id: 'va' }), makeEpisode({ id: 'b', video_id: 'vb' }), makeEpisode({ id: 'c', video_id: 'vc' }), makeEpisode({ id: 'd', video_id: 'vd' })];
  const items = eps.map(makeItem);
  const base = { items, currentIndex: 0, repeatMode: 'off' as const, shuffle: false };

  it('returns the next n after the cursor', () => {
    const out = upcomingQueueEpisodes({ ...base, currentIndex: 1 }, 2);
    expect(out.map((e: Episode) => e.id)).toEqual(['c', 'd']);
  });

  it('upcoming_queue_wraps_on_repeat_all_and_is_empty_on_shuffle', () => {
    const wrapped = upcomingQueueEpisodes({ ...base, currentIndex: 3, repeatMode: 'all' }, 2);
    expect(wrapped.map((e: Episode) => e.id)).toEqual(['a', 'b']);
    const noWrap = upcomingQueueEpisodes({ ...base, currentIndex: 3, repeatMode: 'off' }, 2);
    expect(noWrap).toEqual([]); // cursor on the last item, repeat 'off' → nothing upcoming, no wrap
    const shuffled = upcomingQueueEpisodes({ ...base, currentIndex: 0, shuffle: true }, 2);
    expect(shuffled).toEqual([]);
  });
});

describe('PlayerProvider queue look-ahead and media error', () => {
  let api: ReturnType<typeof usePlayer>;
  let probeVideo: HTMLVideoElement;

  function renderEngine() {
    function Probe() {
      const ctx = usePlayer();
      api = ctx;
      return <video data-testid="probe-video" ref={ctx.registerVideoElement} />;
    }
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <PlayerProvider>
          <Probe />
          <Toaster />
        </PlayerProvider>
      </QueryClientProvider>,
    );
    probeVideo = screen.getByTestId('probe-video') as HTMLVideoElement;
  }

  it('prefetches the next 2 queue items with origin queue on cursor change', async () => {
    const ep = makeEpisode({ id: 'cur' });
    const next1 = makeEpisode({ id: 'n1' });
    const next2 = makeEpisode({ id: 'n2' });
    const later = makeEpisode({ id: 'later' });
    streamMock.mockResolvedValue({ url: 'https://mock/cur.webm', format: 'video' });
    renderEngine();
    act(() => {
      useQueueStore.setState({
        items: [makeItem(ep), makeItem(next1), makeItem(next2), makeItem(later)],
        currentIndex: 0,
      });
    });
    await act(async () => {
      api.play(ep);
    });
    await waitFor(() => {
      expect(prefetchMock).toHaveBeenCalledWith('n1', 'video', 'queue');
      expect(prefetchMock).toHaveBeenCalledWith('n2', 'video', 'queue');
    });
    expect(prefetchMock).not.toHaveBeenCalledWith('later', expect.anything(), expect.anything());
    expect(prefetchMock).not.toHaveBeenCalledWith('cur', expect.anything(), expect.anything());
  });

  it('media_error_invalidates_and_reresolves', async () => {
    const ep = makeEpisode();
    streamMock.mockResolvedValue({ url: 'https://mock/ep.webm', format: 'video' });
    renderEngine();
    await act(async () => {
      api.play(ep);
    });
    await waitFor(() => expect(streamMock).toHaveBeenCalledTimes(1));
    expect(probeVideo.src).toContain('https://mock/ep.webm');

    // The element errors (dead cache entry / upstream 403): the engine must
    // invalidate the cache entry and re-resolve (stream called again). The
    // seek-suppressed error path is the one that re-resolves, so mark a seek
    // in flight first (api.seek sets the flag the error path checks).
    streamMock.mockResolvedValueOnce({ url: 'https://mock/ep2.webm', format: 'video' });
    await act(async () => {
      api.seek(5);
      fireEvent(probeVideo, new Event('error'));
    });
    await waitFor(() => expect(invalidateMock).toHaveBeenCalledWith(ep.id));
    await waitFor(() => expect(streamMock).toHaveBeenCalledTimes(2), { timeout: 2000 });
  });

  it('stripped_url_error_retries_original_once', async () => {
    // Task 7: the backend resolved a tracker-stripped URL and kept the
    // original as fallback_url. First error → play the original ONCE (no
    // re-resolve, no invalidation); second error → normal path, no loop.
    const ep = makeEpisode();
    const stripped = 'https://cdn.example.com/ep.webm';
    const original = 'https://podtrac.com/pts/redirect.mp3/https://cdn.example.com/ep.webm';
    streamMock.mockResolvedValue({ url: stripped, format: 'video', fallback_url: original });
    renderEngine();
    await act(async () => {
      api.play(ep);
    });
    await waitFor(() => expect(probeVideo.src).toContain(stripped));

    await act(async () => {
      fireEvent(probeVideo, new Event('error'));
    });
    await waitFor(() => expect(probeVideo.src).toContain('podtrac.com'));
    // the fallback is the same cache entry — no re-resolve happened
    expect(streamMock).toHaveBeenCalledTimes(1);
    expect(invalidateMock).not.toHaveBeenCalled();

    await act(async () => {
      fireEvent(probeVideo, new Event('error'));
    });
    await waitFor(() => expect(invalidateMock).toHaveBeenCalledWith(ep.id));
    // second error → normal error path, no re-resolve loop
    expect(streamMock).toHaveBeenCalledTimes(1);
  });

  it('hls_error_uses_fallback_url', async () => {
    // Task 9: a video resolve returns the HLS master with the progressive
    // URL as fallback_url; an HLS load error plays the fallback once.
    const ep = makeEpisode();
    streamMock.mockResolvedValue({
      url: 'http://127.0.0.1:9/hls/tok/master.m3u8?cap=2160&start=lowest',
      format: 'hls',
      fallback_url: 'http://127.0.0.1:9/stream/tok2',
    });
    renderEngine();
    await act(async () => {
      api.play(ep);
    });
    await waitFor(() => expect(probeVideo.src).toContain('/hls/'));
    await act(async () => {
      fireEvent(probeVideo, new Event('error'));
    });
    await waitFor(() => expect(probeVideo.src).toContain('/stream/'));
    expect(streamMock).toHaveBeenCalledTimes(1);
  });
});
