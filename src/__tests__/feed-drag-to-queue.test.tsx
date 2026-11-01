// @vitest-environment jsdom
/**
 * F05 (waypoint echoprism-nicety-drag-an): drag an episode from the feed
 * straight into the queue. The queue screen's own drag/reorder is covered by
 * f05 e2e (F05-H1/E1); this pins the FEED-TO-QUEUE gesture.
 *
 * Mechanics: the feed card's dragStart stores the episode in the queue store
 * (the drag starts in one component and drops in another, so the payload
 * lives in shared state, not dataTransfer); the queue pane is a drop zone and
 * honours the queue_behavior preference (play_next vs add_end).
 *
 * Discriminants: removing the store write from the card's dragStart fails the
 * first test; a drop handler that ignores the payload or always addItem fails
 * the second/third.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { EpisodeCard } from '../components/feed/EpisodeCard';
import { QueueScreen } from '../components/screens/QueueScreen';
import { resetMockState } from '../mocks/router';
import { useQueueStore } from '../store/slices/queueSlice';
import type { Episode } from '../types';

function makeEpisode(id: string, title: string): Episode {
  return {
    id,
    channel_id: 'ch-1',
    external_id: `ext-${id}`,
    title,
    video_id: `yt-${id}`,
    is_downloaded: false,
    progress_seconds: 0,
    created_at: '2026-10-19T00:00:00Z',
    updated_at: '2026-10-19T00:00:00Z',
  };
}

function renderWithProviders(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

const dataTransfer = () => ({ setData: vi.fn(), effectAllowed: '', dropEffect: '' });

beforeEach(() => {
  resetMockState();
  useQueueStore.setState({
    items: [],
    currentIndex: 0,
    draggedEpisode: null,
  });
});
afterEach(cleanup);

describe('F05: drag from feed into the queue', () => {
  it('dragStart on a feed card stores the episode as the drag payload', () => {
    const ep = makeEpisode('ep-drag-1', 'Draggable episode');
    const { container } = renderWithProviders(<EpisodeCard episode={ep} />);
    const card = container.querySelector('article') as HTMLElement;

    fireEvent.dragStart(card, { dataTransfer: dataTransfer() });
    expect(useQueueStore.getState().draggedEpisode?.id).toBe('ep-drag-1');

    fireEvent.dragEnd(card);
    expect(useQueueStore.getState().draggedEpisode).toBeNull();
  });

  it('dropping a dragged feed episode on the queue pane queues it (play_next per the fixture pref)', async () => {
    // Seed one playing item so play_next has a cursor to insert after.
    useQueueStore.setState({
      items: [{
        id: 'q-0', queue_id: 'local', episode_id: 'ep-0', added_at: '2026-10-19T00:00:00Z',
        source: 'feed', play_mode: 'unified', position: 0, episode: makeEpisode('ep-0', 'Already playing'),
      }],
      currentIndex: 0,
    });
    renderWithProviders(<QueueScreen />);
    await waitFor(() => expect(screen.getByTestId('queue-drop-zone')).toBeTruthy());

    const ep = makeEpisode('ep-drag-2', 'Dropped from the feed');
    // In act(): the drop handler reads the store through the component's
    // subscription, so the payload must be flushed into the rendered tree
    // before the event, not just written to the store.
    act(() => {
      useQueueStore.getState().setDraggedEpisode(ep);
    });
    fireEvent.drop(screen.getByTestId('queue-drop-zone'), { dataTransfer: dataTransfer() });

    const { items, draggedEpisode } = useQueueStore.getState();
    expect(draggedEpisode).toBeNull();
    expect(items).toHaveLength(2);
    // The mock fixture's queue_behavior is 'play_next': inserted right after
    // the cursor, not appended.
    expect(items[1].episode?.id).toBe('ep-drag-2');
    expect(items[1].source).toBe('feed');
  });

  it('a drop with no dragged feed episode is a no-op (reorder drops unaffected)', async () => {
    useQueueStore.setState({
      items: [{
        id: 'q-0', queue_id: 'local', episode_id: 'ep-0', added_at: '2026-10-19T00:00:00Z',
        source: 'feed', play_mode: 'unified', position: 0, episode: makeEpisode('ep-0', 'Only item'),
      }],
      currentIndex: 0,
    });
    renderWithProviders(<QueueScreen />);
    await waitFor(() => expect(screen.getByTestId('queue-drop-zone')).toBeTruthy());

    fireEvent.drop(screen.getByTestId('queue-drop-zone'), { dataTransfer: dataTransfer() });
    expect(useQueueStore.getState().items).toHaveLength(1);
  });
});
