// @vitest-environment jsdom
/**
 * Parity audit batch 3, Task 4 — owner, 2026-11-02: "we still have two play
 * bars (down from the art one point) we need only one main play bar at the
 * bottom."
 *
 * Measured: MiniPlayer (global, fixed bottom) and PlayerScreen (its own full
 * transport under the video) both rendered on /player/:id. Also measured:
 * the bar rendered the QUEUE's current item, not the engine's episode (and
 * vanished with an empty queue); its Restart was disabled for a one-item
 * queue; Picture-in-Picture flipped a flag nothing consumed.
 *
 * Owner decision: the bottom bar is THE transport everywhere; the player
 * screen keeps only the stage and the title/channel line.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, render, screen, waitFor, within, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { PlayerScreen } from '../components/screens/PlayerScreen';
import { MiniPlayer } from '../components/MiniPlayer';
import { PlayerProvider, usePlayer } from '../components/PlayerProvider';
import { ConvergenceProvider } from '../hooks/useConvergence';
import { historyCommands } from '../hooks/useTauriCommands';
import { usePlayerStore } from '../store/slices/playerSlice';
import { useQueueStore } from '../store/slices/queueSlice';
import { resetMockState } from '../mocks/router';
import type { Episode, HistoryEntry } from '../types';

let api: ReturnType<typeof usePlayer>;
function Capture() {
  api = usePlayer();
  return null;
}

function renderApp(path = '/player/ep-video-1') {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ConvergenceProvider>
        <MemoryRouter initialEntries={[path]}>
          <PlayerProvider>
            <Capture />
            <Routes>
              <Route path="/player/:episodeId" element={<PlayerScreen />} />
              <Route path="/feed" element={<div>feed</div>} />
            </Routes>
            <MiniPlayer />
          </PlayerProvider>
        </MemoryRouter>
      </ConvergenceProvider>
    </QueryClientProvider>,
  );
}

const lone: Episode = {
  id: 'ep-lone',
  channel_id: 'ch-1',
  external_id: 'ep-lone',
  title: 'Not in any queue',
  video_id: 'yt-lone',
  is_downloaded: false,
  progress_seconds: 0,
  created_at: '2026-10-19T00:00:00Z',
  updated_at: '2026-10-19T00:00:00Z',
};

beforeAll(() => {
  window.HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve()) as unknown as HTMLMediaElement['play'];
  window.HTMLMediaElement.prototype.pause = vi.fn() as unknown as HTMLMediaElement['pause'];
});
beforeEach(() => {
  resetMockState();
  vi.spyOn(historyCommands, 'record').mockResolvedValue({} as HistoryEntry);
  useQueueStore.setState({ items: [], currentIndex: 0, repeatMode: 'off', shuffle: false });
  usePlayerStore.setState({ isPlaying: false, playbackState: null, isAudioMode: false, isPip: false });
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('One play bar (owner decision 2026-11-02)', () => {
  it('the player screen has exactly ONE of each transport control, all in the bottom bar', async () => {
    renderApp();
    const bar = await screen.findByLabelText('Mini player');
    for (const name of [/^play$/i, /^previous$/i, /^next$/i, /^restart$/i, /^repeat/i, /^fullscreen$/i, /^picture in picture$/i, /^mute$/i]) {
      expect(screen.getAllByRole('button', { name }), String(name)).toHaveLength(1);
      expect(within(bar).getByRole('button', { name }), `${name} lives in the bar`).toBeTruthy();
    }
    expect(screen.getAllByRole('slider', { name: 'Seek' })).toHaveLength(1);
    expect(screen.getAllByRole('slider', { name: 'Volume' })).toHaveLength(1);
    expect(screen.queryByTestId('progress-bar'), 'the player screen has no second timeline').toBeNull();
  });

  it('opening /player/:id with nothing loaded loads that episode, paused, into the bar', async () => {
    renderApp();
    const bar = await screen.findByLabelText('Mini player');
    await waitFor(() => expect(api.currentEpisode?.id).toBe('ep-video-1'));
    expect(within(bar).getByText(api.currentEpisode?.title ?? "")).toBeTruthy();
    expect(usePlayerStore.getState().isPlaying).toBe(false);
  });

  it('the bar shows what the ENGINE plays, even with an empty queue', async () => {
    renderApp('/feed');
    await act(async () => {
      api.play(lone);
    });
    const bar = await screen.findByLabelText('Mini player');
    expect(within(bar).getByText('Not in any queue')).toBeTruthy();
  });

  it('Restart is enabled for a single loaded episode', async () => {
    renderApp('/feed');
    await act(async () => {
      api.load(lone, { paused: true });
    });
    const bar = await screen.findByLabelText('Mini player');
    expect((within(bar).getByRole('button', { name: /^restart$/i }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('Picture in Picture asks the video element for real PiP', async () => {
    const request = vi.fn(() => Promise.resolve({} as PictureInPictureWindow));
    Object.defineProperty(window.HTMLVideoElement.prototype, 'requestPictureInPicture', { configurable: true, value: request });
    Object.defineProperty(document, 'pictureInPictureEnabled', { configurable: true, value: true });
    renderApp();
    const bar = await screen.findByLabelText('Mini player');
    await waitFor(() => expect(api.currentEpisode?.id).toBe('ep-video-1'));
    await act(async () => {
      fireEvent.click(within(bar).getByRole('button', { name: /^picture in picture$/i }));
    });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('the player screen reserves the bar height so the stage is never covered (Review Focus 5)', async () => {
    renderApp();
    await screen.findByLabelText('Mini player');
    const stage = await screen.findByTestId('video-stage');
    expect(stage.closest('[data-testid="player-screen"]')?.className).toMatch(/pb-\[76px\]/);
  });
});
