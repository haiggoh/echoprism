// @vitest-environment jsdom
/**
 * Parity audit batch 3, Task 2 (A1) — owner, 2026-11-02: "audio only doesn't
 * switch video playback to a stream that is just audio" and "seven controls
 * for the same function seems overkill".
 *
 * Measured cause: THREE states meant "audio only". The engine reads
 * usePlayerStore.isAudioMode, but the Header, Sidebar, MiniPlayer and Queue
 * screen checkboxes wrote useQueueStore.audioOnlyMode, which nothing in the
 * engine reads — so the controls the owner actually sees did nothing. The
 * batch-2 fix (1857bed5) repaired the one surface its test reached, through a
 * probe calling ctx.setAudioMode directly, never through a real control.
 *
 * So these tests click the REAL controls on the REAL surfaces. Owner decision
 * 2026-11-02: one state, exactly two controls — the bottom bar and the Header.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { PlayerProvider, usePlayer } from '../components/PlayerProvider';
import { ConvergenceProvider } from '../hooks/useConvergence';
import { Header } from '../components/Header';
import { Sidebar } from '../components/Sidebar';
import { MiniPlayer } from '../components/MiniPlayer';
import { episodeCommands, historyCommands } from '../hooks/useTauriCommands';
import { usePlayerStore } from '../store/slices/playerSlice';
import { useQueueStore } from '../store/slices/queueSlice';
import { resetMockState } from '../mocks/router';
import type { Episode, HistoryEntry } from '../types';

let api: ReturnType<typeof usePlayer>;
function Capture() {
  api = usePlayer();
  // The full player registers its <video>; stand in for it so the engine has
  // a video element to play through, exactly as on /player/:id.
  return <video ref={api.registerVideoElement} />;
}

const episode: Episode = {
  id: 'ep-vid-1',
  channel_id: 'ch-1',
  external_id: 'ep-vid-1',
  title: 'A video episode',
  video_id: 'yt-ep-vid-1',
  is_downloaded: false,
  progress_seconds: 0,
  created_at: '2026-10-19T00:00:00Z',
  updated_at: '2026-10-19T00:00:00Z',
};

function renderShell() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ConvergenceProvider>
        <MemoryRouter>
          <PlayerProvider>
            <Header />
            <Sidebar />
            <Capture />
            <MiniPlayer />
          </PlayerProvider>
        </MemoryRouter>
      </ConvergenceProvider>
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
  useQueueStore.setState({
    items: [{ id: 'qi-1', queue_id: 'local', episode_id: episode.id, added_at: '', source: 'feed', play_mode: 'unified', position: 0, episode }],
    currentIndex: 0,
    repeatMode: 'off',
    shuffle: false,
  });
  usePlayerStore.setState({ isPlaying: false, playbackState: null, isAudioMode: false });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function mockStream() {
  return vi.spyOn(episodeCommands, 'stream').mockImplementation((id: string, format?: string) =>
    Promise.resolve({ url: `https://mock/${format ?? 'video'}/${id}`, format: format ?? 'video' }),
  );
}

describe('Audio only: one state, two controls (owner decision 2026-11-02)', () => {
  it('exists exactly twice — the bottom bar and the Header — and nowhere else', async () => {
    renderShell();
    await waitFor(() => expect(screen.getByLabelText('Mini player')).toBeTruthy());
    const controls = screen.getAllByLabelText('Audio only mode');
    expect(controls).toHaveLength(2);
    expect(within(screen.getByLabelText('Mini player')).getAllByLabelText('Audio only mode')).toHaveLength(1);
    expect(within(screen.getByRole('banner')).getAllByLabelText('Audio only mode')).toHaveLength(1);
  });

  for (const surface of ['bar', 'header'] as const) {
    it(`the ${surface} control re-resolves a playing video as AUDIO, and both controls follow`, async () => {
      const stream = mockStream();
      renderShell();
      await act(async () => {
        api.play(episode);
      });
      await waitFor(() => expect(stream).toHaveBeenLastCalledWith('ep-vid-1', 'video'));

      const scope = surface === 'bar' ? screen.getByLabelText('Mini player') : screen.getByRole('banner');
      await act(async () => {
        fireEvent.click(within(scope).getByLabelText('Audio only mode'));
      });

      await waitFor(() => expect(stream).toHaveBeenLastCalledWith('ep-vid-1', 'audio'));
      expect(usePlayerStore.getState().isAudioMode).toBe(true);
      for (const c of screen.getAllByLabelText('Audio only mode')) {
        expect((c as HTMLInputElement).checked, 'both controls show the one state').toBe(true);
      }
    });
  }

  it('toggling while PAUSED switches the format without starting playback (Review Focus 1)', async () => {
    const stream = mockStream();
    renderShell();
    await act(async () => {
      api.load(episode, { paused: true });
    });
    await act(async () => {
      fireEvent.click(within(screen.getByRole('banner')).getByLabelText('Audio only mode'));
    });
    expect(api.playbackFormat).toBe('audio');
    expect(usePlayerStore.getState().isPlaying).toBe(false);
    expect(stream).not.toHaveBeenCalled();
  });
});
