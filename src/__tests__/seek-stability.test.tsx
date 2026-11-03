// @vitest-environment jsdom
/**
 * Batch 4 item 6 (owner 2026-11-02): "when skipping ahead via the timeline in
 * both videos and podcasts the action sometimes fails with an error, we have
 * to get this more stable." A seek can make the media element fire `error`
 * while the server catches up to the requested position — that must NOT kill
 * playback. Genuine load errors keep the existing danger path.
 *
 * Discriminants: with a seek in flight the error downgrades to a warning and
 * isPlaying stays true (first test); without a seek the error still pauses
 * with the danger toast (second test).
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { PlayerProvider, usePlayer } from '../components/PlayerProvider';
import { ConvergenceProvider } from '../hooks/useConvergence';
import { MiniPlayer } from '../components/MiniPlayer';
import { Toaster, clearToasts } from '../components/ui/Toaster';
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

function renderPlayer() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <PlayerProvider>
          <ConvergenceProvider>
            <Probe />
            <MiniPlayer />
            <Toaster />
          </ConvergenceProvider>
        </PlayerProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

const ep: Episode = {
  id: 'ep-pod-1',
  channel_id: 'ch-1',
  external_id: 'ep-pod-1',
  title: 'A long podcast',
  podcast_guid: 'ep-pod-1-guid',
  is_downloaded: false,
  progress_seconds: 0,
  created_at: '2026-11-02T00:00:00Z',
  updated_at: '2026-11-02T00:00:00Z',
};

beforeAll(() => {
  window.HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve()) as unknown as HTMLMediaElement['play'];
  window.HTMLMediaElement.prototype.pause = vi.fn() as unknown as HTMLMediaElement['pause'];
});

beforeEach(() => {
  resetMockState();
  clearToasts();
  useQueueStore.setState({
    items: [{
      id: 'q-0', queue_id: 'local', episode_id: ep.id, added_at: '2026-11-02T00:00:00Z',
      source: 'feed', play_mode: 'unified', position: 0, episode: ep,
    }],
    currentIndex: 0, draggedEpisode: null,
  });
  usePlayerStore.setState({ isPlaying: false, playbackState: null });
});
afterEach(cleanup);

describe('batch 4 item 6: seek errors must not kill playback', () => {
  it('an error during a seek downgrades to a warning toast and playback continues', async () => {
    const { container } = renderPlayer();
    await waitFor(() => expect(api).toBeDefined());
    await act(async () => {
      api.play(ep);
    });
    await waitFor(() => expect(usePlayerStore.getState().isPlaying).toBe(true));

    const audio = container.querySelector('audio') as HTMLAudioElement;
    // Seek and error in the SAME act: jsdom queues `seeked` as a task, and a
    // real browser only fires it once data arrives — mid-seek errors are the
    // case this guard exists for.
    await act(async () => {
      api.seek(1800);
      fireEvent(audio, new Event('error'));
    });

        expect(usePlayerStore.getState().isPlaying).toBe(true);
    expect(await screen.findByText('Seeking…')).toBeTruthy();
    expect(screen.queryByText('Stream error')).toBeNull();

    // Review 2026-11-03: the flag clears on the error path too — a SECOND error
    // with no new seek must hit the danger path, not stay downgraded forever.
    await act(async () => {
      fireEvent(audio, new Event('error'));
    });
    await waitFor(() => expect(usePlayerStore.getState().isPlaying).toBe(false));
    expect(await screen.findByText('Stream error')).toBeTruthy();
  });

  it('a load error with NO seek in flight keeps the danger path', async () => {
    const { container } = renderPlayer();
    await waitFor(() => expect(api).toBeDefined());
    await act(async () => {
      api.play(ep);
    });
    const audio = container.querySelector('audio') as HTMLAudioElement;
    await act(async () => {
      fireEvent(audio, new Event('error'));
    });
    await waitFor(() => expect(usePlayerStore.getState().isPlaying).toBe(false));
    expect(await screen.findByText('Stream error')).toBeTruthy();
    expect(screen.queryByText('Seeking…')).toBeNull();
  });
});
