// @vitest-environment jsdom
/**
 * Live-test 2026-10-28: "I can't jump around on the timeline while its
 * playing. the issue seems to affect only podcast only not video."
 *
 * Measured cause, in two layers that BOTH have to hold:
 *
 *  1. The seek handler bails on `duration <= 0`, so an episode with no known
 *     length silently ignores every click — a fail-open guard, which is why
 *     no gate noticed: nothing errored, the feature was just inert.
 *  2. Podcast episodes carried no duration at all: parse_rss hard-coded None
 *     (a `parse_duration` helper written for this was never wired in), and
 *     every one of the owner's 1,103 podcast rows has duration_seconds NULL.
 *     Video was unaffected because yt-dlp supplies its duration.
 *
 * So the parse fix only helps episodes fetched AFTER it. The 1,103 already
 * stored need the runtime fallback: the media element reports its own length
 * once metadata loads, and the player must adopt it rather than leave the
 * timeline dead.
 *
 * These tests pin the BEHAVIOUR, not the parse: a click on the timeline must
 * move the media element, for an episode with no stored duration. Reverting
 * either layer turns them red.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { PlayerProvider, usePlayer } from '../components/PlayerProvider';
import { ConvergenceProvider } from '../hooks/useConvergence';
import { MiniPlayer } from '../components/MiniPlayer';
import { resetMockState } from '../mocks/router';
import { usePlayerStore } from '../store/slices/playerSlice';
import { useQueueStore } from '../store/slices/queueSlice';
import type { Episode } from '../types';

let api: ReturnType<typeof usePlayer>;

function Probe() {
  const ctx = usePlayer();
  api = ctx;
  return <audio ref={() => {}} />;
}

/** jsdom reports duration as NaN; give the element a real one. */
function withDuration(el: HTMLMediaElement, seconds: number) {
  Object.defineProperty(el, 'duration', { configurable: true, get: () => seconds });
}

/** A podcast episode as they exist in the wild: no duration, no video id. */
function podcastEpisode(id: string, title: string): Episode {
  return {
    id,
    channel_id: 'ch-1',
    external_id: id,
    title,
    is_downloaded: false,
    progress_seconds: 0,
    created_at: '2026-10-19T00:00:00Z',
    updated_at: '2026-10-19T00:00:00Z',
  } satisfies Episode;
}

function renderPlayer() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PlayerProvider>
          <ConvergenceProvider>
            <Probe />
            <MiniPlayer />
          </ConvergenceProvider>
        </PlayerProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeAll(() => {
  window.HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve()) as unknown as HTMLMediaElement['play'];
  window.HTMLMediaElement.prototype.pause = vi.fn() as unknown as HTMLMediaElement['pause'];
});

beforeEach(() => {
  resetMockState();
  // MiniPlayer renders from the QUEUE's current item, so the episode has to be
  // queued for the seek strip to exist at all — which is also how the owner
  // reaches it in the app.
  const ep = podcastEpisode('ep-pod-1', 'Episode 42 — RSS is winning again');
  useQueueStore.setState({
    items: [{
      id: 'q-0', queue_id: 'local', episode_id: ep.id, added_at: '2026-10-19T00:00:00Z',
      source: 'feed', play_mode: 'unified', position: 0, episode: ep,
    }],
    currentIndex: 0, repeatMode: 'off', shuffle: false,
  });
  usePlayerStore.setState({ isPlaying: false, playbackState: null });
});

afterEach(cleanup);

describe('Live-test: a podcast timeline must be seekable', () => {
  it('adopts the media element own duration when the episode carries none', async () => {
    const { container } = renderPlayer();
    await waitFor(() => expect(api).toBeDefined());

    const audio = container.querySelector('audio') as HTMLAudioElement;
    withDuration(audio, 600);

    await act(async () => {
      api.play(useQueueStore.getState().items[0]!.episode!);
    });

    // Without this the seek path bails on duration <= 0 and every click is a
    // silent no-op — the owner's exact symptom.
    await waitFor(() => {
      expect(api.duration, 'the player must learn the length it was not given').toBe(600);
    });
  });

  it('a keyboard seek moves a podcast that has no stored duration', async () => {
    renderPlayer();
    await waitFor(() => expect(api).toBeDefined());

    const audio = document.querySelector('audio') as HTMLAudioElement;
    withDuration(audio, 600);

    await act(async () => {
      api.play(useQueueStore.getState().items[0]!.episode!);
    });
    await waitFor(() => expect(api.duration).toBe(600));

    // The always-visible seek strip (MiniPlayer), keyboard-operable — this is
    // the same `duration <= 0` guard as the full player's progress bar, and the
    // keyboard path needs no getBoundingClientRect mock so it stays deterministic.
    const strip = screen.getByRole('slider', { name: 'Seek' });
    await act(async () => {
      fireEvent.keyDown(strip, { key: 'ArrowRight' });
    });

    // THE discriminant: the media element MOVED. Before the fix the guard
    // returned early and currentTime never changed — a silent no-op.
    await waitFor(() => {
      expect(api.currentTime).toBe(10);
      expect(audio.currentTime).toBe(10);
    });
  });

  it('a stored duration is never overwritten by the element', async () => {
    // An episode that DOES carry a duration keeps it — the fallback fills a
    // gap, it does not second-guess known data.
    const { container } = renderPlayer();
    await waitFor(() => expect(api).toBeDefined());

    const audio = container.querySelector('audio') as HTMLAudioElement;
    withDuration(audio, 999);

    await act(async () => {
      api.play({ ...podcastEpisode('ep-pod-2', 'Episode 43'), duration_seconds: 420 });
    });

    await waitFor(() => expect(api.duration).toBe(420));
  });
});
