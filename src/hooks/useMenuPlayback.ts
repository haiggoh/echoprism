import { useEffect, useRef } from 'react';
import { listen } from '@tauri-apps/api/event';
import { DEFAULT_SEEK_OFFSET, type MediaSessionPlayer } from './useMediaSession';

/** Emitted by the native Playback menu (src-tauri/src/app_menu.rs PLAYBACK_EVENT). */
export const MENU_PLAYBACK_EVENT = 'menu-playback';

/**
 * Routes the native Playback menu to the player's own callbacks — the same
 * ones the in-app buttons and the media keys use. Subscribes only inside the
 * Tauri shell; browser dev and e2e have no native menu.
 */
export function useMenuPlayback(player: MediaSessionPlayer) {
  // Subscribe once; read the latest player (position changes every tick).
  const playerRef = useRef(player);
  playerRef.current = player;

  useEffect(() => {
    if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) return;
    const skip = (delta: number) => {
      const { currentTime, duration, seek } = playerRef.current;
      const target = Math.max(0, currentTime + delta);
      seek(duration > 0 ? Math.min(target, duration) : target);
    };
    const actions: Record<string, () => void> = {
      toggle: () => playerRef.current.togglePlay(),
      next: () => playerRef.current.nextTrack(),
      previous: () => playerRef.current.previousTrack(),
      'skip-forward': () => skip(DEFAULT_SEEK_OFFSET),
      'skip-back': () => skip(-DEFAULT_SEEK_OFFSET),
    };

    let disposed = false;
    let stop: (() => void) | undefined;
    void listen<string>(MENU_PLAYBACK_EVENT, (event) => actions[event.payload]?.()).then((fn) => {
      // Unmounted before the subscription resolved: release it immediately.
      if (disposed) fn();
      else stop = fn;
    });
    return () => {
      disposed = true;
      stop?.();
    };
  }, []);
}
