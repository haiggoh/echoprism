// @vitest-environment jsdom
/**
 * 2d — W3C Media Session wiring (macOS Now Playing + hardware media keys).
 * jsdom has no navigator.mediaSession, so a recording fake stands in for
 * WebKit's: the tests assert what the hook HANDS the OS (metadata, playback
 * state, position) and that every OS action drives the player callback it
 * names. Whether WKWebView forwards this to the macOS panel is the live probe
 * in docs/plans/2026-10-22-2d-native-mac-polish.md (phase 0), not a unit claim.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, render, cleanup } from '@testing-library/react';
import { useMediaSession, type MediaSessionPlayer } from '../hooks/useMediaSession';
import { PlayerProvider, usePlayer } from '../components/PlayerProvider';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { usePlayerStore } from '../store/slices/playerSlice';
import type { Episode } from '../types';

vi.mock('../hooks/useTauriCommands', () => ({
  episodeCommands: { stream: vi.fn(() => new Promise(() => {})) },
}));

type Handler = ((details: MediaSessionActionDetails) => void) | null;

class FakeMediaSession {
  metadata: MediaMetadata | null = null;
  playbackState: MediaSessionPlaybackState = 'none';
  handlers = new Map<MediaSessionAction, Handler>();
  positions: MediaPositionState[] = [];
  setActionHandler(action: MediaSessionAction, handler: Handler) {
    this.handlers.set(action, handler);
  }
  setPositionState(state?: MediaPositionState) {
    if (state) this.positions.push(state);
  }
  fire(action: MediaSessionAction, details: Partial<MediaSessionActionDetails> = {}) {
    const h = this.handlers.get(action);
    if (!h) throw new Error(`no handler registered for ${action}`);
    h({ action, ...details } as MediaSessionActionDetails);
  }
}

class FakeMediaMetadata {
  title: string;
  artist: string;
  album: string;
  artwork: MediaImage[];
  constructor(init: MediaMetadataInit = {}) {
    this.title = init.title ?? '';
    this.artist = init.artist ?? '';
    this.album = init.album ?? '';
    this.artwork = [...(init.artwork ?? [])];
  }
}

const episode: Episode = {
  id: 'ep-1',
  channel_id: 'ch-1',
  external_id: 'ext-1',
  title: 'RSS is winning again',
  thumbnail_url: 'https://img.example/ep-1.jpg',
  is_downloaded: false,
  progress_seconds: 0,
  channel: { id: 'ch-1', title: 'The Vergecast' },
} as Episode;

let session: FakeMediaSession;

function makePlayer(overrides: Partial<MediaSessionPlayer> = {}): MediaSessionPlayer {
  return {
    currentEpisode: episode,
    isPlaying: true,
    currentTime: 30,
    duration: 600,
    playbackRate: 1,
    togglePlay: vi.fn(),
    pause: vi.fn(),
    seek: vi.fn(),
    nextTrack: vi.fn(),
    previousTrack: vi.fn(),
    ...overrides,
  };
}

beforeEach(() => {
  session = new FakeMediaSession();
  Object.defineProperty(navigator, 'mediaSession', { value: session, configurable: true });
  vi.stubGlobal('MediaMetadata', FakeMediaMetadata);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  // Remove the property entirely so the feature-detection test sees a
  // browser without the API.
  delete (navigator as { mediaSession?: unknown }).mediaSession;
});

describe('useMediaSession', () => {
  it('publishes the current episode as Now Playing metadata', () => {
    renderHook(() => useMediaSession(makePlayer()));
    const md = session.metadata as unknown as FakeMediaMetadata;
    expect(md.title).toBe('RSS is winning again');
    expect(md.artist).toBe('The Vergecast');
    expect(md.artwork).toEqual([{ src: 'https://img.example/ep-1.jpg' }]);
  });

  it('clears metadata and reports "none" when nothing is loaded', () => {
    renderHook(() => useMediaSession(makePlayer({ currentEpisode: null, isPlaying: false })));
    expect(session.metadata).toBeNull();
    expect(session.playbackState).toBe('none');
  });

  it('mirrors isPlaying into playbackState', () => {
    const { rerender } = renderHook((p: MediaSessionPlayer) => useMediaSession(p), {
      initialProps: makePlayer({ isPlaying: true }),
    });
    expect(session.playbackState).toBe('playing');
    rerender(makePlayer({ isPlaying: false }));
    expect(session.playbackState).toBe('paused');
  });

  it('routes play/pause keys through the player, not the media element', () => {
    const paused = makePlayer({ isPlaying: false });
    renderHook(() => useMediaSession(paused));
    session.fire('play');
    expect(paused.togglePlay).toHaveBeenCalledTimes(1);
    session.fire('pause');
    expect(paused.pause).toHaveBeenCalledTimes(1);
  });

  it('a play key while ALREADY playing does not toggle playback off', () => {
    const playing = makePlayer({ isPlaying: true });
    renderHook(() => useMediaSession(playing));
    session.fire('play');
    expect(playing.togglePlay).not.toHaveBeenCalled();
  });

  it('routes next/previous track to the queue', () => {
    const p = makePlayer();
    renderHook(() => useMediaSession(p));
    session.fire('nexttrack');
    expect(p.nextTrack).toHaveBeenCalledTimes(1);
    session.fire('previoustrack');
    expect(p.previousTrack).toHaveBeenCalledTimes(1);
  });

  it('seekto goes to the requested absolute position', () => {
    const p = makePlayer();
    renderHook(() => useMediaSession(p));
    session.fire('seekto', { seekTime: 123 });
    expect(p.seek).toHaveBeenCalledWith(123);
  });

  it('seek back/forward honour the OS offset and clamp to the episode', () => {
    const p = makePlayer({ currentTime: 30, duration: 600 });
    renderHook(() => useMediaSession(p));
    session.fire('seekbackward', { seekOffset: 5 });
    expect(p.seek).toHaveBeenLastCalledWith(25);
    session.fire('seekforward', { seekOffset: 20 });
    expect(p.seek).toHaveBeenLastCalledWith(50);
    session.fire('seekbackward', { seekOffset: 999 });
    expect(p.seek).toHaveBeenLastCalledWith(0);
    session.fire('seekforward', { seekOffset: 999 });
    expect(p.seek).toHaveBeenLastCalledWith(600);
  });

  it('handlers read the LATEST position, not the one at registration', () => {
    const first = makePlayer({ currentTime: 30 });
    const { rerender } = renderHook((p: MediaSessionPlayer) => useMediaSession(p), {
      initialProps: first,
    });
    const later = makePlayer({ currentTime: 300 });
    rerender(later);
    session.fire('seekforward', { seekOffset: 10 });
    expect(later.seek).toHaveBeenLastCalledWith(310);
  });

  it('keeps the OS scrubber in step with position, duration and rate', () => {
    renderHook(() => useMediaSession(makePlayer({ currentTime: 30, duration: 600, playbackRate: 1.5 })));
    expect(session.positions[session.positions.length - 1]).toEqual({ position: 30, duration: 600, playbackRate: 1.5 });
  });

  it('skips position state while the duration is unknown (the API throws on 0/NaN)', () => {
    renderHook(() => useMediaSession(makePlayer({ duration: 0 })));
    expect(session.positions).toEqual([]);
  });

  it('unregisters every handler on unmount', () => {
    const { unmount } = renderHook(() => useMediaSession(makePlayer()));
    unmount();
    for (const [action, handler] of session.handlers) {
      expect(handler, action).toBeNull();
    }
  });

  it('is a no-op where the API does not exist', () => {
    delete (navigator as { mediaSession?: unknown }).mediaSession;
    expect(() => renderHook(() => useMediaSession(makePlayer()))).not.toThrow();
  });
});

describe('PlayerProvider publishes to the media session', () => {
  it('a hardware pause key stops playback in the store', () => {
    let api!: ReturnType<typeof usePlayer>;
    function Probe() {
      api = usePlayer();
      return null;
    }
    // PlayerProvider reads the D7 play-mode chain from the shared react-query
    // cache on queue advance, so it needs the provider the real app has.
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <PlayerProvider>
          <Probe />
        </PlayerProvider>
      </QueryClientProvider>
    );
    act(() => api.play(episode));
    expect((session.metadata as unknown as FakeMediaMetadata).title).toBe('RSS is winning again');
    expect(usePlayerStore.getState().isPlaying).toBe(true);
    act(() => session.fire('pause'));
    expect(usePlayerStore.getState().isPlaying).toBe(false);
    expect(session.playbackState).toBe('paused');
  });
});
