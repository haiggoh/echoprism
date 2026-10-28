// @vitest-environment jsdom
/**
 * Live-test 2026-10-28: "once I queue a new video and go to the queue tab to
 * skip around the queue I don't know how to get back to the video player from
 * there. I hear it but I can't bring back the video player to see it, routing
 * through the history seems to be the only workaround currently but that's not
 * how it should be designed."
 *
 * Measured cause: the queue row's Play action only moves the queue cursor
 * (`setCurrentIndex(index)`) and never navigates. The `/player/:episodeId`
 * route exists and the Feed and History screens both link to it — the Queue
 * tab, the one surface you use precisely to move between items, was the only
 * one that could not get you back to the player you are listening to.
 *
 * Discriminant: reverting the navigation in onPlay fails the first test; the
 * second pins that it still moves the cursor, so the fix cannot degenerate
 * into a plain link that abandons the queue position.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { QueueScreen } from '../components/screens/QueueScreen';
import { PlayerProvider } from '../components/PlayerProvider';
import { useQueueStore } from '../store/slices/queueSlice';
import type { Episode, QueueItem } from '../types';

/** Stands in for the real PlayerScreen: proves the route was reached. */
function PlayerMarker() {
  return <div data-testid="player-screen">the video player</div>;
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

function renderQueue() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/queue']}>
        <PlayerProvider>
          <Routes>
            <Route path="/queue" element={<QueueScreen />} />
            <Route path="/player/:episodeId" element={<PlayerMarker />} />
          </Routes>
        </PlayerProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useQueueStore.setState({
    items: seedItems(['First episode', 'Second episode', 'Third episode']),
    currentIndex: 0,
    repeatMode: 'off',
    shuffle: false,
  });
});

afterEach(cleanup);

describe('Live-test: the queue must get you back to the player', () => {
  it('clicking a queue row opens the player for that episode', async () => {
    renderQueue();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Queue' })).toBeTruthy());

    // The second row: the owner queued something new and wants to SEE it.
    fireEvent.click(screen.getByRole('button', { name: 'Play Second episode' }));

    await waitFor(() => {
      expect(screen.getByTestId('player-screen'), 'the player route must open').toBeTruthy();
    });
  });

  it('opening the player also moves the queue cursor onto that item', async () => {
    // The fix must not degenerate into a bare link: the cursor has to follow,
    // otherwise the Mini player's Previous/Next navigate from the wrong place.
    renderQueue();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Queue' })).toBeTruthy());
    expect(useQueueStore.getState().currentIndex).toBe(0);

    fireEvent.click(screen.getByRole('button', { name: 'Play Third episode' }));

    await waitFor(() => {
      expect(screen.getByTestId('player-screen')).toBeTruthy();
      expect(useQueueStore.getState().currentIndex).toBe(2);
    });
  });

  it('the currently-playing row is reachable too — not just the others', async () => {
    // The exact complaint: you are ON the queue tab, something is playing, and
    // there is no way back to it. Clicking the row that is already current
    // must still open the player.
    renderQueue();
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Queue' })).toBeTruthy());
    useQueueStore.setState({ currentIndex: 1 });

    fireEvent.click(screen.getByRole('button', { name: 'Play Second episode' }));

    await waitFor(() => {
      expect(screen.getByTestId('player-screen')).toBeTruthy();
    });
  });
});
