// @vitest-environment jsdom
/**
 * Phase 4 (dead-controls plan): playlists — QueueScreen "Save as playlist"
 * snapshots the queue in order, and PlaylistsScreen lists / replays / renames
 * / deletes them. Unmocked bridge → real mock router, so the IPC keys and
 * the mock's semantics are what the UI exercises.
 *
 * Discriminants: a save that drops the order fails the first test; a Play
 * that does not fill the queue in playlist order fails the second; a rename
 * that does not persist fails the third.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { QueueScreen } from '../components/screens/QueueScreen';
import { PlaylistsScreen } from '../components/screens/PlaylistsScreen';
import { PlayerProvider } from '../components/PlayerProvider';
import { Toaster } from '../components/ui/Toaster';
import { mockInvoke, resetMockState } from '../mocks/router';
import { useQueueStore } from '../store/slices/queueSlice';
import { usePlayerStore } from '../store/slices/playerSlice';
import type { Episode, QueueItem } from '../types';

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

function seedQueue(ids: string[]) {
  const items: QueueItem[] = ids.map((id, i) => ({
    id: `q-${i}`,
    queue_id: 'local',
    episode_id: id,
    added_at: '2026-10-19T00:00:00Z',
    source: 'feed',
    play_mode: 'unified',
    position: i,
    episode: makeEpisode(id, `Title ${id}`),
  }));
  useQueueStore.setState({ items, currentIndex: 0, draggedEpisode: null });
}

function renderWithProviders(ui: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PlayerProvider>
          {ui}
          <Toaster />
        </PlayerProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeAll(() => {
  // jsdom does not implement media playback; the Play test drives the real
  // PlayerProvider, so play() must return a promise (the provider .catch()es it).
  window.HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve()) as unknown as HTMLMediaElement['play'];
  window.HTMLMediaElement.prototype.pause = vi.fn() as unknown as HTMLMediaElement['pause'];
});

beforeEach(() => {
  resetMockState();
  useQueueStore.setState({ items: [], currentIndex: 0, draggedEpisode: null });
  usePlayerStore.setState({ isPlaying: false, playbackState: null });
});
afterEach(cleanup);

describe('Phase 4: playlists', () => {
  it('Save as playlist snapshots the queue in order', async () => {
    seedQueue(['ep-b', 'ep-a', 'ep-c']);
    renderWithProviders(<QueueScreen />);

    fireEvent.click(screen.getByRole('button', { name: 'Save as playlist' }));
    fireEvent.change(screen.getByLabelText('Playlist name'), { target: { value: 'My mix' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(async () => {
      const playlists = (await mockInvoke('list_playlists')) as unknown as Array<{ id: string; name: string }>;
      expect(playlists).toHaveLength(1);
      expect(playlists[0].name).toBe('My mix');
      const items = (await mockInvoke('list_playlist_items', { playlistId: playlists[0].id })) as unknown as Array<{
        episode_id: string;
        position: number;
      }>;
      expect(items.map((i) => i.episode_id)).toEqual(['ep-b', 'ep-a', 'ep-c']);
      expect(items.map((i) => i.position)).toEqual([0, 1, 2]);
    });
  });

  it('Play fills the queue in playlist order and starts the first item', async () => {
    await mockInvoke('save_queue_as_playlist', {
      name: 'Replay mix',
      episodeIds: ['ep-video-1', 'ep-smn-1'],
    });
    renderWithProviders(<PlaylistsScreen />);

    await waitFor(() => expect(screen.getAllByTestId('playlist-row')).toHaveLength(1));
    fireEvent.click(screen.getByRole('button', { name: 'Play playlist Replay mix' }));

    await waitFor(() => {
      const { items, currentIndex } = useQueueStore.getState();
      expect(items.map((i) => i.episode_id)).toEqual(['ep-video-1', 'ep-smn-1']);
      expect(currentIndex).toBe(0);
      expect(usePlayerStore.getState().isPlaying).toBe(true);
    });
  });

  it('rename and delete update the list', async () => {
    const p = (await mockInvoke('save_queue_as_playlist', { name: 'Old name', episodeIds: ['ep-video-1'] })) as unknown as {
      id: string;
    };
    renderWithProviders(<PlaylistsScreen />);

    await waitFor(() => expect(screen.getByText('Old name')).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: 'Rename playlist Old name' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'New name' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(screen.getByText('New name')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Delete playlist New name' }));
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(async () => {
      expect(screen.queryByTestId('playlist-row')).toBeNull();
      expect(await mockInvoke('list_playlists')).toHaveLength(0);
      // The item cascaded with the playlist.
      expect(await mockInvoke('list_playlist_items', { playlistId: p.id })).toHaveLength(0);
    });
  });

  it('a playlist row expands to its items with per-item remove', async () => {
    const p = (await mockInvoke('save_queue_as_playlist', {
      name: 'Expandable',
      episodeIds: ['ep-video-1', 'ep-pod-1'],
    })) as unknown as { id: string };
    renderWithProviders(<PlaylistsScreen />);

    await waitFor(() => expect(screen.getByText('Expandable')).toBeTruthy());
    fireEvent.click(screen.getByText('Expandable'));
    await waitFor(() => expect(screen.getAllByTestId('playlist-item-row')).toHaveLength(2));

    const firstRemove = screen.getAllByRole('button', { name: /^Remove / })[0];
    fireEvent.click(firstRemove);
    await waitFor(async () => {
      expect(screen.getAllByTestId('playlist-item-row')).toHaveLength(1);
      expect(await mockInvoke('list_playlist_items', { playlistId: p.id })).toHaveLength(1);
    });
  });
});
