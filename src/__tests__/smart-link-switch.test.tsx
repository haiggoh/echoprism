// @vitest-environment jsdom
/**
 * Parity audit batch 3, Task 6 — features.csv (must): "Smart Episode Link
 * badge + one-tap switch"; fixes_combined.md §6: "In queue/player, show
 * '🔗 Video version' or '🔗 Audio version' button when match exists. One-tap
 * switch: preserves playback position (rough sync via timestamp %)".
 *
 * Measured before: every read path attaches linked_episode_id (feed, episode,
 * search — Rust and mock), the card showed a "Link" badge, but nothing ever
 * switched: the feed card held two "Smart link badge would go here" stubs and
 * the player had no switch at all.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { PlayerProvider, usePlayer } from '../components/PlayerProvider';
import { MiniPlayer } from '../components/MiniPlayer';
import { episodeCommands, historyCommands } from '../hooks/useTauriCommands';
import { usePlayerStore } from '../store/slices/playerSlice';
import { useQueueStore } from '../store/slices/queueSlice';
import { resetMockState } from '../mocks/router';
import type { Episode, HistoryEntry } from '../types';

let api: ReturnType<typeof usePlayer>;
function Capture() {
  api = usePlayer();
  return <video ref={api.registerVideoElement} />;
}

function renderBar() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PlayerProvider>
          <Capture />
          <MiniPlayer />
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
  vi.spyOn(historyCommands, 'record').mockResolvedValue({} as HistoryEntry);
  useQueueStore.setState({ items: [], currentIndex: 0, repeatMode: 'off', shuffle: false });
  usePlayerStore.setState({ isPlaying: false, playbackState: null, isAudioMode: false });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Smart link one-tap switch (features.csv must-have)', () => {
  it('a linked podcast offers the Video version, and one tap plays the twin at the same relative position', async () => {
    // The fixture link-1 pairs ep-pod-1 (podcast) with ep-video-1 (video).
    const pod = await episodeCommands.get('ep-pod-1');
    expect(pod.linked_episode_id, 'fixture premise: ep-pod-1 is linked').toBe('ep-video-1');
    const twin = await episodeCommands.get('ep-video-1');
    const stream = vi.spyOn(episodeCommands, 'stream');

    renderBar();
    await act(async () => {
      api.play({ ...pod, duration_seconds: 1000 });
    });
    // Halfway through the podcast.
    await act(async () => {
      usePlayerStore.getState().setPlaybackState({ position_seconds: 500, duration_seconds: 1000 });
    });

    const bar = screen.getByLabelText('Mini player');
    const sw = await within(bar).findByRole('button', { name: /video version/i });
    await act(async () => {
      fireEvent.click(sw);
    });

    await waitFor(() => expect(api.currentEpisode?.id).toBe('ep-video-1'));
    await waitFor(() => expect(stream).toHaveBeenLastCalledWith('ep-video-1', 'video'));
    const expected = 0.5 * (twin.duration_seconds ?? 1000);
    expect(usePlayerStore.getState().playbackState?.position_seconds).toBeCloseTo(expected, 0);
  });

  it('an unlinked episode offers no switch', async () => {
    const lone: Episode = {
      id: 'ep-lone', channel_id: 'ch-1', external_id: 'ep-lone', title: 'Lone', video_id: 'yt-lone',
      is_downloaded: false, progress_seconds: 0, created_at: '', updated_at: '',
    };
    renderBar();
    await act(async () => {
      api.play(lone);
    });
    const bar = screen.getByLabelText('Mini player');
    expect(within(bar).queryByRole('button', { name: /(video|audio) version/i })).toBeNull();
  });

  it('switching replaces the playing queue slot, so the queue shows what plays', async () => {
    const pod = await episodeCommands.get('ep-pod-1');
    useQueueStore.setState({
      items: [{ id: 'qi-pod', queue_id: 'local', episode_id: pod.id, added_at: '', source: 'feed', play_mode: 'unified', position: 0, episode: pod }],
      currentIndex: 0,
    });
    renderBar();
    await act(async () => {
      api.play(pod);
    });
    const bar = screen.getByLabelText('Mini player');
    await act(async () => {
      fireEvent.click(await within(bar).findByRole('button', { name: /video version/i }));
    });
    await waitFor(() => expect(useQueueStore.getState().items[0].episode?.id).toBe('ep-video-1'));
    expect(useQueueStore.getState().items).toHaveLength(1);
  });
});
