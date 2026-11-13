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

describe('Round 6 Task 1: the audio-only toggle keeps the playhead [echoprism-audio-switch-position]', () => {
  /**
   * Simulate the measured WebKit behaviour: a `currentTime` write made BEFORE
   * `loadedmetadata` is reset by the media load algorithm, so the fresh
   * element starts at 0 and its first `timeupdate` carries 0.
   */
  function webkitPreMetaReset(el: HTMLMediaElement) {
    const proto = Object.getOwnPropertyDescriptor(window.HTMLMediaElement.prototype, 'currentTime');
    if (!proto || typeof proto.get !== 'function' || typeof proto.set !== 'function') {
      throw new Error('currentTime descriptor not found on the prototype');
    }
    const protoGet = proto.get;
    const protoSet = proto.set;
    let metaLoaded = false;
    Object.defineProperty(el, 'currentTime', {
      configurable: true,
      get: () => protoGet.call(el),
      set: (v: number) => {
        if (metaLoaded) protoSet.call(el, v);
        // before metadata the write is lost — exactly the reported bug
      },
    });
    return { markMetadataLoaded: () => { metaLoaded = true; } };
  }

  function mockStream() {
    return vi.spyOn(episodeCommands, 'stream').mockImplementation((id: string, format?: string) =>
      Promise.resolve({ url: `https://mock/${format ?? 'video'}/${id}.m3u8`, format: format ?? 'video' }));
  }

  const storedPosition = () => usePlayerStore.getState().playbackState?.position_seconds;

  it('restores the stored position after loadedmetadata, not before', async () => {
    const stream = mockStream();
    const { container } = renderPlayer();
    await waitFor(() => expect(api).toBeDefined());
    const audio = container.querySelector('audio') as HTMLMediaElement;
    const webkit = webkitPreMetaReset(audio);

    await act(async () => { api.play(videoEpisode('ep-vid-1', 'A video episode')); });
    await waitFor(() => expect(stream).toHaveBeenCalledWith('ep-vid-1', 'video'));
    const video = container.querySelector('video') as HTMLVideoElement;
    await waitFor(() => expect(video.getAttribute('src')).toBe('https://mock/video/ep-vid-1.m3u8'));

    // Owner's repro: play, seek to ~2:00, then toggle audio-only.
    await act(async () => { api.seek(120); });
    expect(storedPosition()).toBe(120);

    await act(async () => { fireEvent.click(screen.getByText('audio-on')); });
    await waitFor(() => expect(stream).toHaveBeenLastCalledWith('ep-vid-1', 'audio'));
    await waitFor(() => expect(audio.getAttribute('src')).toBe('https://mock/audio/ep-vid-1.m3u8'));

    // The fresh element is at 0 (the pre-metadata write was lost); its
    // timeupdate must NOT clobber the stored position.
    await act(async () => { fireEvent(audio, new Event('timeupdate')); });
    expect(storedPosition(), 'the store position survives the fresh element\'s 0').toBe(120);

    // After metadata loads, the stored position is applied to the element.
    await act(async () => {
      webkit.markMetadataLoaded();
      fireEvent(audio, new Event('loadedmetadata'));
    });
    expect(audio.currentTime).toBe(120);

    await act(async () => {
      fireEvent(audio, new Event('seeked'));
      fireEvent(audio, new Event('timeupdate'));
    });
    expect(storedPosition()).toBe(120);
    stream.mockRestore();
  });

  it('toggling audio-only while paused keeps the stored position', async () => {
    const stream = mockStream();
    const { container } = renderPlayer();
    await waitFor(() => expect(api).toBeDefined());
    const audio = container.querySelector('audio') as HTMLMediaElement;
    const webkit = webkitPreMetaReset(audio);

    await act(async () => { api.play(videoEpisode('ep-vid-1', 'A video episode')); });
    await waitFor(() => expect(stream).toHaveBeenCalledWith('ep-vid-1', 'video'));
    await act(async () => { api.pause(); });
    await act(async () => { api.seek(120); });
    expect(storedPosition()).toBe(120);

    // Toggle while paused: no resolve yet (paused), then press play.
    await act(async () => { fireEvent.click(screen.getByText('audio-on')); });
    await act(async () => { api.togglePlay(); });
    await waitFor(() => expect(stream).toHaveBeenLastCalledWith('ep-vid-1', 'audio'));
    await waitFor(() => expect(audio.getAttribute('src')).toBe('https://mock/audio/ep-vid-1.m3u8'));

    await act(async () => { fireEvent(audio, new Event('timeupdate')); });
    expect(storedPosition()).toBe(120);
    await act(async () => {
      webkit.markMetadataLoaded();
      fireEvent(audio, new Event('loadedmetadata'));
    });
    expect(audio.currentTime).toBe(120);
    stream.mockRestore();
  });

  it('a seek made BEFORE loadedmetadata wins over the pending restore (final-review finding)', async () => {
    const stream = mockStream();
    const { container } = renderPlayer();
    await waitFor(() => expect(api).toBeDefined());
    const audio = container.querySelector('audio') as HTMLMediaElement;
    const webkit = webkitPreMetaReset(audio);

    await act(async () => { api.play(videoEpisode('ep-vid-1', 'A video episode')); });
    await waitFor(() => expect(stream).toHaveBeenCalledWith('ep-vid-1', 'video'));
    await act(async () => { api.seek(120); });

    await act(async () => { fireEvent.click(screen.getByText('audio-on')); });
    await waitFor(() => expect(stream).toHaveBeenLastCalledWith('ep-vid-1', 'audio'));
    await waitFor(() => expect(audio.getAttribute('src')).toBe('https://mock/audio/ep-vid-1.m3u8'));

    // The owner drags the playbar again while the new element is still loading
    // metadata: the pending restore (120 s) must NOT override the fresh seek.
    await act(async () => { api.seek(600); });
    await act(async () => {
      webkit.markMetadataLoaded();
      fireEvent(audio, new Event('loadedmetadata'));
    });
    expect(audio.currentTime, 'the user\'s seek target wins, not the stale restore').toBe(600);
    await act(async () => { fireEvent(audio, new Event('seeked')); });
    expect(storedPosition()).toBe(600);
    stream.mockRestore();
  });

  it('audio→video→audio within one resolve keeps the position and ends on audio', async () => {
    const stream = mockStream();
    const { container } = renderPlayer();
    await waitFor(() => expect(api).toBeDefined());
    const audio = container.querySelector('audio') as HTMLMediaElement;
    const webkit = webkitPreMetaReset(audio);

    await act(async () => { api.play(videoEpisode('ep-vid-1', 'A video episode')); });
    await waitFor(() => expect(stream).toHaveBeenCalledWith('ep-vid-1', 'video'));
    await act(async () => { api.seek(120); });

    // Rapid double toggle before the ~7 s resolve finishes.
    await act(async () => { fireEvent.click(screen.getByText('audio-on')); });
    await act(async () => { fireEvent.click(screen.getByText('audio-off')); });
    await act(async () => { fireEvent.click(screen.getByText('audio-on')); });

    await waitFor(() => expect(stream).toHaveBeenLastCalledWith('ep-vid-1', 'audio'));
    await waitFor(() => expect(audio.getAttribute('src')).toBe('https://mock/audio/ep-vid-1.m3u8'));
    await act(async () => { fireEvent(audio, new Event('timeupdate')); });
    expect(storedPosition(), 'the position is never reset to 0 mid-toggle-storm').toBe(120);
    await act(async () => {
      webkit.markMetadataLoaded();
      fireEvent(audio, new Event('loadedmetadata'));
    });
    expect(audio.currentTime).toBe(120);
    stream.mockRestore();
  });
});

describe('Round 6 Task 2: seeking works in audio-only [echoprism-audio-only-seek]', () => {
  function mockStream() {
    return vi.spyOn(episodeCommands, 'stream').mockImplementation((id: string, format?: string) =>
      Promise.resolve({ url: `https://mock/${format ?? 'video'}/${id}.m3u8`, format: format ?? 'video' }));
  }

  const storedPosition = () => usePlayerStore.getState().playbackState?.position_seconds;

  it('seek() in audio-only mode moves the audio element, not a stale video element', async () => {
    const stream = mockStream();
    const { container } = renderPlayer();
    await waitFor(() => expect(api).toBeDefined());
    const audio = container.querySelector('audio') as HTMLMediaElement;
    const video = container.querySelector('video') as HTMLVideoElement;

    await act(async () => { api.play(videoEpisode('ep-vid-1', 'A video episode')); });
    await waitFor(() => expect(video.getAttribute('src')).toBe('https://mock/video/ep-vid-1.m3u8'));

    // Toggle to audio-only; the audio element takes over the stream.
    await act(async () => { fireEvent.click(screen.getByText('audio-on')); });
    await waitFor(() => expect(stream).toHaveBeenLastCalledWith('ep-vid-1', 'audio'));
    await waitFor(() => expect(audio.getAttribute('src')).toBe('https://mock/audio/ep-vid-1.m3u8'));
    await act(async () => {
      fireEvent(audio, new Event('loadedmetadata'));
      fireEvent(audio, new Event('seeked'));
    });

    // Review Focus 3 shape: seek far past what a throttled stream has buffered
    // (80% of a 1 h episode).
    await act(async () => { api.seek(2880); });
    expect(audio.currentTime, 'the ACTIVE audio element carries the seek').toBe(2880);
    expect(storedPosition()).toBe(2880);
    // A stale video element must not still be the seek target.
    expect(video.currentTime).not.toBe(2880);

    // The element reports the completed seek; the store follows.
    await act(async () => {
      fireEvent(audio, new Event('seeked'));
      fireEvent(audio, new Event('timeupdate'));
    });
    expect(storedPosition()).toBe(2880);
    stream.mockRestore();
  });
});

describe('Round 9: a seek-suppressed media error is diagnosable and recovers [echoprism-audio-only-large]', () => {
  /**
   * The owner's stall: an out-of-buffer seek (expired upstream URL on a
   * direct-served stream) makes the element fire `error`; the Batch 4 guard
   * swallowed it with a toast claiming "playback continues" — but an errored
   * element never recovers by itself, so playback was stranded until the user
   * poked it. Small jumps stayed inside the buffer and never hit the network,
   * which is why only large seeks stalled.
   *
   * Discriminants: dropping the diagnostic warns fails test 1; dropping the
   * re-resolve or the position re-apply fails test 2.
   */
  function mockStream() {
    return vi.spyOn(episodeCommands, 'stream').mockImplementation((id: string, format?: string) =>
      Promise.resolve({ url: `https://mock/${format ?? 'video'}/${id}.m3u8`, format: format ?? 'video' }));
  }

  const storedPosition = () => usePlayerStore.getState().playbackState?.position_seconds;

  it('a seek-adjacent media error logs the element diagnostics (was: swallowed silently)', async () => {
    const stream = mockStream();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = renderPlayer();
    await waitFor(() => expect(api).toBeDefined());
    const audio = container.querySelector('audio') as HTMLMediaElement;
    const video = container.querySelector('video') as HTMLVideoElement;

    await act(async () => { api.play(videoEpisode('ep-vid-1', 'A video episode')); });
    await waitFor(() => expect(video.getAttribute('src')).toBe('https://mock/video/ep-vid-1.m3u8'));
    await act(async () => { fireEvent.click(screen.getByText('audio-on')); });
    await waitFor(() => expect(audio.getAttribute('src')).toBe('https://mock/audio/ep-vid-1.m3u8'));
    await act(async () => {
      fireEvent(audio, new Event('loadedmetadata'));
      fireEvent(audio, new Event('seeked'));
    });

    // The out-of-buffer seek whose request fails: error fires with the seek
    // guard armed (no `seeked` ever came).
    await act(async () => { api.seek(2880); });
    await act(async () => { fireEvent(audio, new Event('error')); });

    expect(
      warnSpy.mock.calls.some((c) => typeof c[0] === 'string' && c[0].includes('seek-suppressed')),
      'the swallowed error must carry the seek-suppressed marker',
    ).toBe(true);
    expect(
      warnSpy.mock.calls.some((c) => typeof c[0] === 'string' && c[0].includes('currentSrc')),
      'the diagnostic detail (code/networkState/currentSrc) must be logged',
    ).toBe(true);
    warnSpy.mockRestore();
    stream.mockRestore();
  });

  it('a seek-adjacent media error recovers: re-resolve + re-apply the sought position', async () => {
    const stream = mockStream();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = renderPlayer();
    await waitFor(() => expect(api).toBeDefined());
    const audio = container.querySelector('audio') as HTMLMediaElement;
    const video = container.querySelector('video') as HTMLVideoElement;

    await act(async () => { api.play(videoEpisode('ep-vid-1', 'A video episode')); });
    await waitFor(() => expect(video.getAttribute('src')).toBe('https://mock/video/ep-vid-1.m3u8'));
    await act(async () => { fireEvent.click(screen.getByText('audio-on')); });
    await waitFor(() => expect(audio.getAttribute('src')).toBe('https://mock/audio/ep-vid-1.m3u8'));
    await act(async () => {
      fireEvent(audio, new Event('loadedmetadata'));
      fireEvent(audio, new Event('seeked'));
    });
    const resolvesBefore = stream.mock.calls.length;

    await act(async () => { api.seek(2880); });
    await act(async () => { fireEvent(audio, new Event('error')); });

    // THE discriminant: the errored element is revived — the stream is
    // re-resolved for the SAME format (not stranded), and the sought position
    // is re-applied once the fresh element loads metadata.
    await waitFor(() => {
      expect(stream.mock.calls.length, 'the recovery must re-resolve the stream').toBeGreaterThan(resolvesBefore);
      expect(stream).toHaveBeenLastCalledWith('ep-vid-1', 'audio');
    });
    await waitFor(() => {
      expect(video.paused, 'the video stream must stay released (paused, not playing)').toBe(true);
    });
    await act(async () => { fireEvent(audio, new Event('loadedmetadata')); });
    expect(audio.currentTime, 'the sought position (2880) is re-applied by the recovery').toBe(2880);
    await act(async () => {
      fireEvent(audio, new Event('seeked'));
      fireEvent(audio, new Event('timeupdate'));
    });
    expect(storedPosition()).toBe(2880);
    warnSpy.mockRestore();
    stream.mockRestore();
  });
});
