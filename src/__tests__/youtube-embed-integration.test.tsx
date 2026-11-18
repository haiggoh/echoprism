// @vitest-environment jsdom
/**
 * Task 5 integration: the YouTube embed player is chosen ONLY when the
 * preference is on AND the episode has a video_id AND the format is video.
 * An embed error (150) falls back to the extractor pipeline. Audio-only never
 * embeds (but the iframe stays mounted, warm).
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { PlayerProvider, usePlayer } from '../components/PlayerProvider';
import { episodeCommands, historyCommands, settingsCommands } from '../hooks/useTauriCommands';
import { usePlayerStore } from '../store/slices/playerSlice';
import { useQueueStore } from '../store/slices/queueSlice';
import { resetMockState } from '../mocks/router';
import type { Episode, HistoryEntry } from '../types';

let api: ReturnType<typeof usePlayer>;

function Probe() {
  const ctx = usePlayer();
  api = ctx;
  return (
    <>
      <video ref={ctx.registerVideoElement} />
      <button type="button" onClick={() => ctx.setAudioMode(true)}>audio-on</button>
      <button type="button" onClick={() => ctx.setAudioMode(false)}>audio-off</button>
    </>
  );
}

function videoEpisode(id: string, title: string): Episode {
  return {
    id,
    channel_id: 'ch-1',
    external_id: id,
    title,
    video_id: `yt-${id}`,
    is_downloaded: false,
    progress_seconds: 0,
    created_at: '2026-10-19T00:00:00Z',
    updated_at: '2026-10-19T00:00:00Z',
  } satisfies Episode;
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

function mockStream() {
  return vi.spyOn(episodeCommands, 'stream').mockImplementation((id: string, format?: string) =>
    Promise.resolve({ url: `https://mock/${format ?? 'video'}/${id}.m3u8`, format: format ?? 'video' }));
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

describe('Task 5 embed integration', () => {
  it('embed is active only with pref on + video_id + video format; audio never embeds but stays mounted', async () => {
    const prefs = await settingsCommands.get();
    vi.spyOn(settingsCommands, 'get').mockResolvedValue({ ...prefs, use_youtube_player: true });
    const stream = mockStream();
    renderPlayer();
    await waitFor(() => expect(api).toBeDefined());

    await act(async () => {
      api.play(videoEpisode('ep-vid-1', 'A video episode'));
    });
    await waitFor(() => expect(api.embedPlayerActive).toBe(true));

    // audio-only never uses the embed, but the iframe stays mounted (warm)
    await act(async () => {
      fireEvent.click(screen.getByText('audio-on'));
    });
    await waitFor(() => expect(api.embedPlayerActive).toBe(false));
    expect(api.embedMounted).toBe(true);
    stream.mockRestore();
  });

  it('embed error 150 falls back to the extractor pipeline (re-resolve for video)', async () => {
    const prefs = await settingsCommands.get();
    vi.spyOn(settingsCommands, 'get').mockResolvedValue({ ...prefs, use_youtube_player: true });
    const stream = mockStream();
    renderPlayer();
    await waitFor(() => expect(api).toBeDefined());
    await act(async () => {
      api.play(videoEpisode('ep-vid-1', 'A video episode'));
    });
    await waitFor(() => expect(api.embedPlayerActive).toBe(true));

    const callsBefore = stream.mock.calls.length;
    await act(async () => {
      api.onEmbedEvent({ type: 'error', code: 150 });
    });
    await waitFor(() => expect(api.embedPlayerActive, 'embed blocked after error 150').toBe(false));
    await waitFor(() => {
      expect(stream.mock.calls.length).toBeGreaterThan(callsBefore);
      expect(stream).toHaveBeenLastCalledWith('ep-vid-1', 'video');
    });
    stream.mockRestore();
  });

  it('pref on but NO video_id (podcast): embed never mounts, extractor used', async () => {
    const prefs = await settingsCommands.get();
    vi.spyOn(settingsCommands, 'get').mockResolvedValue({ ...prefs, use_youtube_player: true });
    const stream = mockStream();
    renderPlayer();
    await waitFor(() => expect(api).toBeDefined());
    const podcast = { ...videoEpisode('ep-pod-x', 'A podcast'), video_id: undefined } as Episode;
    await act(async () => {
      api.play(podcast);
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(api.embedMounted).toBe(false);
    expect(api.embedPlayerActive).toBe(false);
    await waitFor(() => expect(stream).toHaveBeenCalledWith('ep-pod-x', 'audio'));
    stream.mockRestore();
  });

  it.each([150, 101, 153, 5, 100])('embed error %i falls back to the extractor pipeline', async (code) => {
    const prefs = await settingsCommands.get();
    vi.spyOn(settingsCommands, 'get').mockResolvedValue({ ...prefs, use_youtube_player: true });
    const stream = mockStream();
    renderPlayer();
    await waitFor(() => expect(api).toBeDefined());
    await act(async () => {
      api.play(videoEpisode('ep-vid-1', 'A video episode'));
    });
    await waitFor(() => expect(api.embedPlayerActive).toBe(true));

    const callsBefore = stream.mock.calls.length;
    await act(async () => {
      api.onEmbedEvent({ type: 'error', code });
    });
    await waitFor(() => expect(api.embedPlayerActive, `error ${code} blocks the embed`).toBe(false));
    await waitFor(() => {
      expect(stream.mock.calls.length).toBeGreaterThan(callsBefore);
      expect(stream).toHaveBeenLastCalledWith('ep-vid-1', 'video');
    });
    stream.mockRestore();
  });

  it('toggle off (default): the embed never activates', async () => {
    mockStream();
    renderPlayer();
    await waitFor(() => expect(api).toBeDefined());
    await act(async () => {
      api.play(videoEpisode('ep-vid-1', 'A video episode'));
    });
    // give the prefs query a chance to resolve
    await act(async () => {
      await Promise.resolve();
    });
    expect(api.embedMounted).toBe(false);
    expect(api.embedPlayerActive).toBe(false);
  });
});
