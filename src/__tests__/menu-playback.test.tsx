// @vitest-environment jsdom
/**
 * 2d — native Playback menu. The Rust side (src-tauri/src/app_menu.rs) only
 * emits `menu-playback` with an action name; this hook routes it to the same
 * player callbacks the buttons and media keys use. The Tauri event API is
 * mocked at its boundary; the routing is real.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, renderHook, render, cleanup } from '@testing-library/react';
import type { MediaSessionPlayer } from '../hooks/useMediaSession';
import { PlayerProvider, usePlayer } from '../components/PlayerProvider';
import { usePlayerStore } from '../store/slices/playerSlice';
import type { Episode } from '../types';

vi.mock('../hooks/useTauriCommands', () => ({
  episodeCommands: { stream: vi.fn(() => new Promise(() => {})) },
}));

type Listener = (event: { payload: string }) => void;
const listeners = new Map<string, Listener>();
const unlisten = vi.fn();
vi.mock('@tauri-apps/api/event', () => ({
  listen: vi.fn(async (name: string, cb: Listener) => {
    listeners.set(name, cb);
    return unlisten;
  }),
}));

import { listen } from '@tauri-apps/api/event';
import { useMenuPlayback, MENU_PLAYBACK_EVENT } from '../hooks/useMenuPlayback';

function makePlayer(overrides: Partial<MediaSessionPlayer> = {}): MediaSessionPlayer {
  return {
    currentEpisode: null,
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

const flush = () => new Promise((r) => setTimeout(r, 0));
const fire = (payload: string) => listeners.get(MENU_PLAYBACK_EVENT)!({ payload });

beforeEach(() => {
  listeners.clear();
  unlisten.mockClear();
  vi.mocked(listen).mockClear();
  (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
});

afterEach(() => {
  cleanup();
  delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
});

describe('useMenuPlayback', () => {
  it('listens on the event name the Rust menu emits', async () => {
    renderHook(() => useMenuPlayback(makePlayer()));
    await flush();
    // Must match app_menu::PLAYBACK_EVENT.
    expect(MENU_PLAYBACK_EVENT).toBe('menu-playback');
    expect(listeners.has('menu-playback')).toBe(true);
  });

  it('routes each menu action to its player callback', async () => {
    const p = makePlayer({ currentTime: 30, duration: 600 });
    renderHook(() => useMenuPlayback(p));
    await flush();
    fire('toggle');
    expect(p.togglePlay).toHaveBeenCalledTimes(1);
    fire('next');
    expect(p.nextTrack).toHaveBeenCalledTimes(1);
    fire('previous');
    expect(p.previousTrack).toHaveBeenCalledTimes(1);
    fire('skip-forward');
    expect(p.seek).toHaveBeenLastCalledWith(40);
    fire('skip-back');
    expect(p.seek).toHaveBeenLastCalledWith(20);
  });

  it('skips clamp to the episode and read the latest position', async () => {
    const { rerender } = renderHook((p: MediaSessionPlayer) => useMenuPlayback(p), {
      initialProps: makePlayer({ currentTime: 30 }),
    });
    await flush();
    const late = makePlayer({ currentTime: 595, duration: 600 });
    rerender(late);
    fire('skip-forward');
    expect(late.seek).toHaveBeenLastCalledWith(600);
    const early = makePlayer({ currentTime: 4, duration: 600 });
    rerender(early);
    fire('skip-back');
    expect(early.seek).toHaveBeenLastCalledWith(0);
  });

  it('ignores unknown actions', async () => {
    const p = makePlayer();
    renderHook(() => useMenuPlayback(p));
    await flush();
    fire('rewind');
    for (const fn of [p.togglePlay, p.pause, p.seek, p.nextTrack, p.previousTrack]) {
      expect(fn).not.toHaveBeenCalled();
    }
  });

  it('unlistens on unmount', async () => {
    const { unmount } = renderHook(() => useMenuPlayback(makePlayer()));
    await flush();
    unmount();
    expect(unlisten).toHaveBeenCalledTimes(1);
  });

  it('does not subscribe outside the Tauri shell (browser dev / e2e)', async () => {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
    renderHook(() => useMenuPlayback(makePlayer()));
    await flush();
    expect(listen).not.toHaveBeenCalled();
  });
});

describe('PlayerProvider listens to the Playback menu', () => {
  it('the menu Play/Pause item toggles playback in the store', async () => {
    let api!: ReturnType<typeof usePlayer>;
    function Probe() {
      api = usePlayer();
      return null;
    }
    render(
      <PlayerProvider>
        <Probe />
      </PlayerProvider>
    );
    await act(flush);
    const ep = { id: 'ep-1', channel_id: 'c', external_id: 'x', title: 't', video_id: 'v', is_downloaded: false, progress_seconds: 0 } as Episode;
    act(() => api.play(ep));
    expect(usePlayerStore.getState().isPlaying).toBe(true);
    act(() => fire('toggle'));
    expect(usePlayerStore.getState().isPlaying).toBe(false);
  });
});
