// @vitest-environment jsdom
/**
 * Live-test batch 2, Task 3: "the audio only checkbox doesn't seem to do
 * anything. my idea way to have it stop streaming the video stream of a video
 * and stream only its audio stream from youtube when this made is active."
 *
 * Measured cause: setAudioMode (PlayerProvider.tsx:217) writes the standing
 * preference and calls applyPlaybackFormat, which only switches WHICH element
 * is active. It never clears streamUrl, and the single resolve effect bails on
 * `streamUrl` being already set (line 231) — so toggling mid-playback leaves
 * the video stream in place while moving the active element to the hidden
 * <audio>, which has no src. Nothing audible or visible changes, which is
 * exactly what the owner saw.
 *
 * The checkbox is wired, so this is an INEFFECTIVE control, not a dead one.
 *
 * Discriminants: removing the stream invalidation fails the first two tests;
 * dropping the position carry-over fails the third.
 */
import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { PlayerProvider, usePlayer } from '../components/PlayerProvider';
import { episodeCommands, historyCommands } from '../hooks/useTauriCommands';
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
      <button onClick={() => ctx.setAudioMode(true)}>audio-on</button>
      <button onClick={() => ctx.setAudioMode(false)}>audio-off</button>
    </>
  );
}

/** An audio element for the hidden engine, so a src can be observed. */
function AudioSlot() {
  const ctx = usePlayer();
  void ctx;
  return null;
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
          <AudioSlot />
        </PlayerProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeAll(() => {
  // jsdom does not implement media playback at all: `play()` returns undefined
  // and the provider chains `.catch` off it.
  window.HTMLMediaElement.prototype.play = vi.fn(() => Promise.resolve()) as unknown as HTMLMediaElement['play'];
  window.HTMLMediaElement.prototype.pause = vi.fn() as unknown as HTMLMediaElement['pause'];
});

beforeEach(() => {
  resetMockState();
  // The resolve path records history after a successful stream; the mock
  // returns a value the provider chains off, so give it a real promise.
  vi.spyOn(historyCommands, 'record').mockResolvedValue({} as HistoryEntry);
  useQueueStore.setState({ items: [], currentIndex: 0, repeatMode: 'off', shuffle: false });
  usePlayerStore.setState({ isPlaying: false, playbackState: null, isAudioMode: false });
});

afterEach(cleanup);

describe('Live-test batch 2 Task 3: Audio only must actually switch streams', () => {
  it('toggling it during playback re-resolves for the audio stream', async () => {
    const stream = vi.spyOn(episodeCommands, 'stream')
      .mockImplementation((id: string, format?: string) =>
        Promise.resolve({ url: `https://mock/${format ?? 'video'}/${id}.m3u8`, format: format ?? 'video' }));

    const { container } = renderPlayer();
    await waitFor(() => expect(api).toBeDefined());

    await act(async () => {
      api.play(videoEpisode('ep-vid-1', 'A video episode'));
    });
    await waitFor(() => expect(stream).toHaveBeenCalledWith('ep-vid-1', 'video'));
    const callsBefore = stream.mock.calls.length;

    // The owner's action: tick Audio only while it is playing.
    await act(async () => {
      fireEvent.click(screen.getByText('audio-on'));
    });

    // THE discriminant: a fresh resolve for the AUDIO stream, not the same
    // video stream left running on a hidden element.
    await waitFor(() => {
      expect(stream.mock.calls.length).toBeGreaterThan(callsBefore);
      expect(stream).toHaveBeenLastCalledWith('ep-vid-1', 'audio');
    });

    // ...and the video element is no longer the one carrying the stream.
    const video = container.querySelector('video') as HTMLVideoElement;
    await waitFor(() => {
      expect(video.paused, 'the video stream is released, not left playing').toBe(true);
    });
    stream.mockRestore();
  });

  it('toggling it back re-resolves for the video stream', async () => {
    const stream = vi.spyOn(episodeCommands, 'stream')
      .mockImplementation((id: string, format?: string) =>
        Promise.resolve({ url: `https://mock/${format ?? 'video'}/${id}.m3u8`, format: format ?? 'video' }));

    renderPlayer();
    await waitFor(() => expect(api).toBeDefined());
    await act(async () => {
      api.play(videoEpisode('ep-vid-1', 'A video episode'));
    });
    await waitFor(() => expect(stream).toHaveBeenCalledWith('ep-vid-1', 'video'));

    await act(async () => { fireEvent.click(screen.getByText('audio-on')); });
    await waitFor(() => expect(stream).toHaveBeenLastCalledWith('ep-vid-1', 'audio'));

    await act(async () => { fireEvent.click(screen.getByText('audio-off')); });
    await waitFor(() => expect(stream).toHaveBeenLastCalledWith('ep-vid-1', 'video'));
    stream.mockRestore();
  });
});
