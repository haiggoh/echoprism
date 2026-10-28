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
import { PlayerProvider, usePlayer } from '../components/PlayerProvider';
import { ConvergenceProvider } from '../hooks/useConvergence';
import { usePlayerStore } from '../store/slices/playerSlice';
import { useQueueStore } from '../store/slices/queueSlice';
import { resetMockState } from '../mocks/router';

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
