import { useEffect, useRef } from 'react';
import type { Episode } from '../types';

/** The slice of the player the OS media session reads and drives. */
export interface MediaSessionPlayer {
  currentEpisode: Episode | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  playbackRate: number;
  togglePlay: () => void;
  pause: () => void;
  seek: (position: number) => void;
  nextTrack: () => void;
  previousTrack: () => void;
}

/** Skip distance when the OS sends a seek without an offset; the Playback
 *  menu's Skip items use the same distance. */
export const DEFAULT_SEEK_OFFSET = 10;

const ACTIONS: MediaSessionAction[] = [
  'play',
  'pause',
  'nexttrack',
  'previoustrack',
  'seekto',
  'seekbackward',
  'seekforward',
];

/**
 * Publishes playback to the W3C Media Session API — WebKit's route into the
 * macOS Now Playing panel and the hardware media keys. (tauri-plugin-media-session
 * has no macOS implementation; see docs/plans/2026-10-22-2d-native-mac-polish.md.)
 *
 * Every OS action goes through the player's own callbacks, never the media
 * element, so the store stays the single authority for playback state.
 */
export function useMediaSession(player: MediaSessionPlayer) {
  // Handlers register once and read the latest player through this ref:
  // timeupdate re-renders several times a second, and re-registering on each
  // would churn the OS session.
  const playerRef = useRef(player);
  playerRef.current = player;

  useEffect(() => {
    const ms = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined;
    if (!ms) return;
    const clamp = (t: number) => {
      const { duration } = playerRef.current;
      return Math.max(0, duration > 0 ? Math.min(t, duration) : t);
    };
    const handlers: Record<string, MediaSessionActionHandler> = {
      // Hardware keys can send 'play' while already playing; a toggle would
      // stop playback in that case.
      play: () => {
        if (!playerRef.current.isPlaying) playerRef.current.togglePlay();
      },
      pause: () => playerRef.current.pause(),
      nexttrack: () => playerRef.current.nextTrack(),
      previoustrack: () => playerRef.current.previousTrack(),
      seekto: (d) => {
        if (d.seekTime != null) playerRef.current.seek(clamp(d.seekTime));
      },
      seekbackward: (d) =>
        playerRef.current.seek(clamp(playerRef.current.currentTime - (d.seekOffset ?? DEFAULT_SEEK_OFFSET))),
      seekforward: (d) =>
        playerRef.current.seek(clamp(playerRef.current.currentTime + (d.seekOffset ?? DEFAULT_SEEK_OFFSET))),
    };
    for (const action of ACTIONS) {
      try {
        ms.setActionHandler(action, handlers[action]);
      } catch {
        // An engine may reject an action it does not support; the rest still work.
      }
    }
    return () => {
      for (const action of ACTIONS) {
        try {
          ms.setActionHandler(action, null);
        } catch {
          /* unsupported action — nothing was registered */
        }
      }
    };
  }, []);

  const ep = player.currentEpisode;
  useEffect(() => {
    const ms = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined;
    if (!ms) return;
    if (!ep || typeof MediaMetadata === 'undefined') {
      ms.metadata = null;
      return;
    }
    const artworkSrc = ep.thumbnail_url ?? ep.channel?.thumbnail_url;
    ms.metadata = new MediaMetadata({
      title: ep.title,
      artist: ep.channel?.title ?? '',
      artwork: artworkSrc ? [{ src: artworkSrc }] : [],
    });
  }, [ep]);

  useEffect(() => {
    const ms = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined;
    if (!ms) return;
    ms.playbackState = !ep ? 'none' : player.isPlaying ? 'playing' : 'paused';
  }, [ep, player.isPlaying]);

  const { currentTime, duration, playbackRate } = player;
  useEffect(() => {
    const ms = typeof navigator !== 'undefined' ? navigator.mediaSession : undefined;
    // setPositionState throws on a non-finite/zero duration or a position past it.
    if (!ms?.setPositionState || !ep || !Number.isFinite(duration) || duration <= 0) return;
    try {
      ms.setPositionState({
        position: Math.min(Math.max(0, currentTime), duration),
        duration,
        playbackRate: playbackRate > 0 ? playbackRate : 1,
      });
    } catch {
      // A transient invalid state (mid stream switch) is not worth surfacing.
    }
  }, [ep, currentTime, duration, playbackRate]);
}
