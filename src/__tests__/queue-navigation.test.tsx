// @vitest-environment jsdom
/**
 * Live-test Task 8: "the queue isn't working correctly yet, I should be able to
 * skip between items in the queue (play next, play previous)" — and the owner's
 * 11:20 decision: "let restarting be a separate button so that previous always
 * means previous".
 *
 * So the contract is:
 *  - previous() ALWAYS plays the prior item, at any position — deliberately NOT
 *    the common "restart if past 3s" behaviour most players ship. Being 10s into
 *    an episode must not change what Previous does.
 *  - restart() is its OWN action: seek to 0, keep playing, same item.
 *  - Next/Previous are no-ops at the ends (Review Focus 4) — never wrap, never
 *    throw — and the buttons are disabled so the state is visible.
 *
 * Discriminants: making previous() restart when past 3s fails the second test;
 * making restart() advance the queue fails the third; dropping hasNext/
 * hasPrevious fails the fourth and the buttons lose their disabled state.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from 'vitest';
import { act, cleanup, render, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { PlayerProvider, usePlayer } from '../components/PlayerProvider';
import { resetMockState } from '../mocks/router';
import { usePlayerStore } from '../store/slices/playerSlice';
import { useQueueStore } from '../store/slices/queueSlice';
import type { Episode, QueueItem } from '../types';

let api: ReturnType<typeof usePlayer>;

function Probe() {
  const ctx = usePlayer();
  api = ctx;
  return <video ref={ctx.registerVideoElement} />;
}

function seedItems(titles: string[]): QueueItem[] {
  return titles.map((title, i) => ({
    id: `q-${i}`,
    queue_id: 'local',
    episode_id: `ep-${i}`,
    added_at: '2026-10-19T00:00:00Z',
    source: 'feed',
    play_mode: 'unified',
    position: i,
    episode: {
      id: `ep-${i}`,
      channel_id: 'ch-1',
      external_id: `ext-${i}`,
      title,
      video_id: `yt-video-${i}`,
      duration_seconds: 600,
      is_downloaded: false,
      progress_seconds: 0,
      created_at: '2026-10-19T00:00:00Z',
      updated_at: '2026-10-19T00:00:00Z',
    } satisfies Episode,
  }));
}

function renderPlayer() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PlayerProvider>
          <Probe />
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
  useQueueStore.setState({
    items: seedItems(['Episode ONE', 'Episode TWO', 'Episode THREE']),
    currentIndex: 0,
    repeatMode: 'off',
    shuffle: false,
  });
  usePlayerStore.setState({ isPlaying: false, playbackRate: 1 });
});

afterEach(cleanup);

describe('Live-test Task 8: queue navigation', () => {
  it('next() advances to the next item and makes it current', async () => {
    renderPlayer();
    await waitFor(() => expect(api).toBeDefined());

    await act(async () => {
      api.play(useQueueStore.getState().items[0]!.episode!);
    });
    await waitFor(() => expect(useQueueStore.getState().currentIndex).toBe(0));

    await act(async () => {
      api.nextTrack();
    });

    await waitFor(() => {
      expect(useQueueStore.getState().currentIndex).toBe(1);
      expect(api.currentEpisode?.title).toBe('Episode TWO');
    });
  });

  it('previous() ALWAYS plays the prior item, even 10s into the current one', async () => {
    const { container } = renderPlayer();
    await waitFor(() => expect(api).toBeDefined());
    const video = container.querySelector('video') as HTMLVideoElement;

    // Start on item 2 and sit 10s into it.
    await act(async () => {
      api.play(useQueueStore.getState().items[1]!.episode!);
    });
    await waitFor(() => expect(useQueueStore.getState().currentIndex).toBe(1));
    await act(async () => {
      video.currentTime = 10;
    });

    await act(async () => {
      api.previousTrack();
    });

    // The owner's discriminant: it goes BACK, it does not restart item 2.
    await waitFor(() => {
      expect(useQueueStore.getState().currentIndex).toBe(0);
      expect(api.currentEpisode?.title).toBe('Episode ONE');
    });
  });

  it('restart() seeks to 0 on the SAME item without leaving it', async () => {
    const { container } = renderPlayer();
    await waitFor(() => expect(api).toBeDefined());
    const video = container.querySelector('video') as HTMLVideoElement;

    await act(async () => {
      api.play(useQueueStore.getState().items[1]!.episode!);
    });
    await waitFor(() => expect(useQueueStore.getState().currentIndex).toBe(1));
    await act(async () => {
      video.currentTime = 10;
    });
    expect(useQueueStore.getState().currentIndex).toBe(1);

    await act(async () => {
      api.restart();
    });

    await waitFor(() => {
      expect(useQueueStore.getState().currentIndex).toBe(1);
      expect(api.currentEpisode?.title).toBe('Episode TWO');
      expect(api.currentTime).toBe(0);
    });
  });

  it('hasNext/hasPrevious are false at the ends, so the buttons disable', async () => {
    renderPlayer();
    await waitFor(() => expect(api).toBeDefined());

    // At the first item: somewhere to go, nowhere back.
    useQueueStore.setState({ currentIndex: 0 });
    await waitFor(() => {
      expect(api.hasNext).toBe(true);
      expect(api.hasPrevious).toBe(false);
    });

    // In the middle: both ways.
    useQueueStore.setState({ currentIndex: 1 });
    await waitFor(() => {
      expect(api.hasNext).toBe(true);
      expect(api.hasPrevious).toBe(true);
    });

    // At the last item: nowhere forward — 'off' repeat must not wrap.
    useQueueStore.setState({ currentIndex: 2 });
    await waitFor(() => {
      expect(api.hasNext).toBe(false);
      expect(api.hasPrevious).toBe(true);
    });
  });

  it('previous() goes back even with shuffle on — random is not "previous"', async () => {
    renderPlayer();
    await waitFor(() => expect(api).toBeDefined());

    // Seeded so the shuffle branch's random pick would land on the LAST item
    // (index 2), not the previous one. Without the seed this test can pass by
    // luck — Math.random() returning < 1/3 picks 0 and the assertion holds
    // against the buggy code. Measured: it passed once for exactly that reason.
    const random = vi.spyOn(Math, 'random').mockReturnValue(0.99);
    try {
      useQueueStore.setState({ shuffle: true, currentIndex: 1 });
      await act(async () => {
        api.previousTrack();
      });

      // Shuffle reorders the queue itself; navigating BACK must still mean back.
      await waitFor(() => {
        expect(useQueueStore.getState().currentIndex).toBe(0);
      });
      // The fix REMOVED the random branch, so randomness must not be consulted
      // at all. (This assertion is the mirror of the buggy behaviour: the old
      // code called Math.random() here and landed wherever it pointed.)
      expect(random).not.toHaveBeenCalled();
    } finally {
      random.mockRestore();
    }
  });
});
