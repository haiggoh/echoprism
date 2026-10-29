// @vitest-environment jsdom
/**
 * Live-test batch 2, Task 1: the play bar's speaker icon did nothing.
 *
 * Measured: PlayerScreen.tsx:309 rendered a <button aria-label="Volume"> with
 * no onClick at all, sitting directly beside the live volume slider — which
 * carries the SAME accessible name. Two controls named "Volume", one inert.
 * The owner's instruction was explicit: find out why it is there, do not
 * delete it to tidy the bar. It is a speaker icon, so it becomes a MUTE
 * toggle, and the slider keeps being the only control named "Volume".
 *
 * Discriminants: removing the handler fails the first test; forgetting to
 * restore the previous level fails the second; leaving both controls named
 * "Volume" fails the last.
 */
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PlayerScreen } from '../components/screens/PlayerScreen';
import { MiniPlayer } from '../components/MiniPlayer';
import { PlayerProvider, usePlayer } from '../components/PlayerProvider';
import { ConvergenceProvider } from '../hooks/useConvergence';
import { usePlayerStore } from '../store/slices/playerSlice';
import { useQueueStore } from '../store/slices/queueSlice';
import { resetMockState } from '../mocks/router';
import type { Episode } from '../types';

let api: ReturnType<typeof usePlayer>;

function Probe() {
  const ctx = usePlayer();
  api = ctx;
  return <video ref={ctx.registerVideoElement} />;
}

function renderPlayer() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  // PlayerScreen renders "Episode not found" (and therefore no transport bar)
  // until it has loaded an episode from the route param, so the route has to
  // name one and the mock router has to serve it.
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/player/ep-video-1']}>
        <PlayerProvider>
          <ConvergenceProvider>
            <Probe />
            <Routes>
              <Route path="/player/:episodeId" element={<PlayerScreen />} />
            </Routes>
          </ConvergenceProvider>
        </PlayerProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  resetMockState();
  useQueueStore.setState({ items: [], currentIndex: 0, repeatMode: 'off', shuffle: false });
  usePlayerStore.setState({ volume: 0.7, playbackState: null, isPlaying: false });
});

afterEach(cleanup);

describe('Live-test batch 2 Task 1: the speaker icon is a mute toggle', () => {
  it('clicking it mutes, and the slider follows', async () => {
    renderPlayer();
    await waitFor(() => expect(api).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /^mute$/i }));

    await waitFor(() => expect(api.volume).toBe(0));
    const slider = screen.getByRole('slider', { name: 'Volume' }) as HTMLInputElement;
    expect(Number(slider.value)).toBe(0);
  });

  it('clicking it again restores the level it muted from', async () => {
    renderPlayer();
    await waitFor(() => expect(api).toBeDefined());

    const mute = screen.getByRole('button', { name: /^mute$/i });
    fireEvent.click(mute);
    await waitFor(() => expect(api.volume).toBe(0));

    fireEvent.click(screen.getByRole('button', { name: /^unmute$/i }));

    // Not 1.0 — the level the owner had actually set, so unmuting does not
    // blast them.
    await waitFor(() => expect(api.volume).toBeCloseTo(0.7, 5));
  });

  it('muting from a changed level restores THAT level', async () => {
    usePlayerStore.setState({ volume: 0.3 });
    renderPlayer();
    await waitFor(() => expect(api).toBeDefined());

    fireEvent.click(screen.getByRole('button', { name: /^mute$/i }));
    await waitFor(() => expect(api.volume).toBe(0));
    fireEvent.click(screen.getByRole('button', { name: /^unmute$/i }));

    await waitFor(() => expect(api.volume).toBeCloseTo(0.3, 5));
  });

  it('exposes exactly ONE control named "Volume", and it is the slider', async () => {
    // The bug was two elements sharing the name. The icon is a mute toggle
    // with its own label; the slider keeps "Volume".
    renderPlayer();
    await waitFor(() => expect(api).toBeDefined());

    expect(screen.getByRole('button', { name: /^mute$/i })).toBeTruthy();
    expect(screen.getByRole('slider', { name: 'Volume' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Volume' })).toBeNull();
  });
});

/** A queued, playing video — what the mini player renders from. */
function videoEpisode(): Episode {
  return {
    id: 'ep-video-1', channel_id: 'ch-1', external_id: 'ep-video-1', title: 'A video episode',
    video_id: 'yt-1', is_downloaded: false, progress_seconds: 0,
    created_at: '2026-10-19T00:00:00Z', updated_at: '2026-10-19T00:00:00Z',
  } satisfies Episode;
}

/**
 * The SAME defect on the OTHER control surface. The mini player's volume
 * slider is hover-revealed (`opacity-0 invisible group-hover:opacity-100`), so
 * the speaker icon is the only always-visible volume control there — and it was
 * the same no-handler <button> the full player had. Fixing only the full player
 * left this one inert, which is exactly what the owner reported after the first
 * attempt: "the mute button still doesn't mute when clicked and it doesn't show
 * its state".
 */
describe('Live-test batch 2 Task 1 (mini player): the speaker icon mutes too', () => {
  function renderMini() {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    useQueueStore.setState({
      items: [{
        id: 'q-0', queue_id: 'local', episode_id: 'ep-video-1', added_at: '2026-10-19T00:00:00Z',
        source: 'feed', play_mode: 'unified', position: 0, episode: videoEpisode(),
      }],
      currentIndex: 0, repeatMode: 'off', shuffle: false,
    });
    return render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <PlayerProvider>
            <ConvergenceProvider>
              <MiniPlayer />
            </ConvergenceProvider>
          </PlayerProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );
  }

  it('mutes and unmutes from the mini player', async () => {
    renderMini();
    const mute = await waitFor(() => screen.getByRole('button', { name: /^mute$/i }));

    fireEvent.click(mute);
    await waitFor(() => expect(usePlayerStore.getState().volume).toBe(0));

    fireEvent.click(screen.getByRole('button', { name: /^unmute$/i }));
    await waitFor(() => expect(usePlayerStore.getState().volume).toBeCloseTo(0.7, 5));
  });

  it('names the slider, not the icon, "Volume"', async () => {
    // The old defect was two controls sharing the accessible name "Volume" —
    // the icon and the slider — with only one wired.
    renderMini();
    await waitFor(() => screen.getByRole('button', { name: /^mute$/i }));
    expect(screen.getByRole('slider', { name: 'Volume' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Volume' })).toBeNull();
  });
});
