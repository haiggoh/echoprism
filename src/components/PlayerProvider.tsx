import { createContext, useContext, useState, useRef, useCallback, useEffect, ReactNode } from 'react';
import { usePlayerStore } from '../store/slices/playerSlice';
import { useQueueStore } from '../store/slices/queueSlice';
import { episodeCommands } from '../hooks/useTauriCommands';
import { useToasts } from './ui/Toaster';
import { Episode, PlayMode } from '../types';

interface PlayerContextType {
  currentEpisode: Episode | null;
  isPlaying: boolean;
  /** What the CURRENT playback resolves through ('video' | 'audio'): the D7
   *  chain mode or the toggle at play time. Distinct from isAudioMode, the
   *  user's standing preference — a per-play override must not rewrite it. */
  playbackFormat: 'video' | 'audio';
  isAudioMode: boolean;
  isPip: boolean;
  volume: number;
  playbackRate: number;
  progress: number;
  currentTime: number;
  duration: number;
  play: (episode: Episode, mode?: PlayMode) => void;
  /** Load an episode into the engine WITHOUT playback (D2 'load_paused'):
   *  it becomes the current episode at its saved position; pressing play
   *  resolves and starts the stream. opts.mode carries the D7 chain output so
   *  the later toggle-play resolves the rule's format, not the toggle's. */
  load: (episode: Episode, opts?: { paused?: boolean; mode?: PlayMode }) => void;
  pause: () => void;
  togglePlay: () => void;
  seek: (position: number) => void;
  setVolume: (volume: number) => void;
  setPlaybackRate: (rate: number) => void;
  setAudioMode: (mode: boolean) => void;
  togglePip: () => void;
  nextTrack: () => void;
  previousTrack: () => void;
  /** PlayerScreen registers its <video> element here; the engine picks the active media element. */
  registerVideoElement: (el: HTMLVideoElement | null) => void;
}

const PlayerContext = createContext<PlayerContextType | undefined>(undefined);

export function PlayerProvider({ children }: { children: ReactNode }) {
  // Zustand actions are stable references, so destructuring them keeps the
  // callbacks below dependency-stable.
  const {
    isPlaying,
    isAudioMode,
    isPip,
    volume,
    playbackRate,
    playbackState,
    setPlaying,
    setPlaybackState,
    setAudioMode: setStoreAudioMode,
    setPip,
    setVolume,
    setPlaybackRate,
  } = usePlayerStore();
  const { items, currentIndex, nextTrack: queueNext, previousTrack: queuePrev } = useQueueStore();
  const { addToast } = useToasts();

  const [currentEpisode, setCurrentEpisode] = useState<Episode | null>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);
  // What the CURRENT playback resolves through — per-play (D7 chain mode or
  // the toggle at play time). Kept separate from isAudioMode, the user's
  // standing preference: an override writes this, never the toggle (plan:
  // "override affects initial choice only; audio-only toggle still governs
  // subsequent switches").
  const [playbackFormat, setPlaybackFormat] = useState<'video' | 'audio'>('video');

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentEpisodeRef = useRef<Episode | null>(null);
  const isAudioModeRef = useRef(isAudioMode);
  isAudioModeRef.current = isAudioMode;
  // The SYNCHRONOUS authority for the current playback format: play()/load()
  // write it at call time via applyPlaybackFormat, because the resolve effect
  // is triggered by the zustand store (isPlaying) and would otherwise race a
  // format that only exists as pending useState state. Deliberately NOT
  // render-synced (`ref.current = playbackFormat` in the body): React can
  // commit the zustand-driven render before the useState update lands, and
  // that render would clobber the fresh ref with the stale state value.
  // The ref is written ONLY by applyPlaybackFormat (paired with the state).
  const playbackFormatRef = useRef<'video' | 'audio'>('video');

  const applyPlaybackFormat = (format: 'video' | 'audio') => {
    playbackFormatRef.current = format;
    setPlaybackFormat(format);
  };
  // play() re-created each render; auto-advance reads it through a ref to avoid effect loops.
  const playRef = useRef<(ep: Episode, mode?: PlayMode) => void>(() => {});

  // The per-play format: an explicit D7 chain mode wins; otherwise the user's
  // standing toggle decides. 'unified' — the queue's no-preference value —
  // defers to the toggle exactly like an absent mode.
  const formatFor = (mode?: PlayMode): 'video' | 'audio' =>
    mode === 'audio' ? 'audio' : mode === 'video' ? 'video' : isAudioModeRef.current ? 'audio' : 'video';

  const hasVideo = !!currentEpisode && (!!currentEpisode.video_id || !!currentEpisode.video_url);
  // The engine plays through exactly one element: video when the current
  // playback resolves through the video format and the episode has it, the
  // hidden audio element otherwise.
  const activeEl: HTMLMediaElement | null =
    playbackFormat === 'video' && hasVideo && videoEl ? videoEl : audioRef.current;

  const registerVideoElement = useCallback((el: HTMLVideoElement | null) => {
    setVideoEl(el);
  }, []);

  const play = useCallback(
    (ep: Episode, mode?: PlayMode) => {
      currentEpisodeRef.current = ep;
      setCurrentEpisode(ep);
      // Sets the playback format only — NEVER the user's audio toggle, which
      // would leak the override into every later override-less play.
      applyPlaybackFormat(formatFor(mode));
      setPlaying(true); // the resolve effect starts playback once the src is set
      setPlaybackState({
        episode_id: ep.id,
        position_seconds: ep.progress_seconds ?? 0,
        duration_seconds: ep.duration_seconds,
      });
      // Changing episode invalidates any previous stream; resolution is owned
      // by the resolve effect below (single code path, also serves load(paused)).
      setStreamUrl(null);
    },
    [setPlaying, setPlaybackState]
  );
  playRef.current = play;

  const load = useCallback(
    (ep: Episode, opts?: { paused?: boolean; mode?: PlayMode }) => {
      currentEpisodeRef.current = ep;
      setCurrentEpisode(ep);
      // The D7 chain mode travels with a load_paused click, so the later
      // toggle-play resolves the rule's format rather than the toggle's.
      applyPlaybackFormat(formatFor(opts?.mode));
      setPlaying(false);
      setPlaybackState({
        episode_id: ep.id,
        position_seconds: ep.progress_seconds ?? 0,
        duration_seconds: ep.duration_seconds,
      });
      setStreamUrl(null);
    },
    [setPlaying, setPlaybackState]
  );

  // The user's audio toggle: writes the standing preference AND switches the
  // current playback over. Distinct from the D7 chain's per-play mode, which
  // flows through play()/load() into playbackFormat without touching this.
  const setAudioMode = useCallback(
    (mode: boolean) => {
      setStoreAudioMode(mode);
      applyPlaybackFormat(mode ? 'audio' : 'video');
    },
    [setStoreAudioMode]
  );

  // Resolve the stream for the current episode once playback is requested.
  // Single resolution path: play() and load(paused) only set state; this effect
  // turns (isPlaying, current episode, no stream yet) into a stream_episode
  // call. A stale resolution (episode switched mid-flight) is discarded.
  const resolvingRef = useRef(false);
  useEffect(() => {
    if (!isPlaying || streamUrl || resolvingRef.current) return;
    const ep = currentEpisodeRef.current;
    if (!ep) return;
    resolvingRef.current = true;
    // A podcast episode has no video capability: requesting format 'video'
    // fails at the backend and the catch path kills playback. Start from the
    // playback format play()/load() chose (D7 chain mode or the toggle), then
    // apply the episode's own capability as a floor.
    const wantAudio = playbackFormatRef.current === 'audio' || (!ep.video_id && !ep.video_url);
    episodeCommands
      .stream(ep.id, wantAudio ? 'audio' : 'video')
      .then((info) => {
        // Only commit if this episode is still the one the engine is playing.
        if (currentEpisodeRef.current?.id === ep.id) setStreamUrl(info.url);
      })
      .catch(() => {
        if (currentEpisodeRef.current?.id !== ep.id) return;
        setPlaying(false);
        setStreamUrl(null);
        addToast({
          title: 'Playback unavailable',
          description:
            'Could not resolve a stream for this episode. Add a healthy Invidious/Piped instance in Settings first.',
          variant: 'danger',
        });
      })
      .finally(() => {
        resolvingRef.current = false;
      });
  }, [isPlaying, streamUrl, setPlaying, addToast]);

  const pause = useCallback(() => setPlaying(false), [setPlaying]);

  const togglePlay = useCallback(() => setPlaying(!isPlaying), [isPlaying, setPlaying]);

  const seek = useCallback(
    (position: number) => {
      setPlaybackState({ position_seconds: position });
      const el = playbackFormatRef.current === 'video' && videoEl ? videoEl : audioRef.current;
      if (el) el.currentTime = position;
    },
    [setPlaybackState, videoEl]
  );

  const togglePip = useCallback(() => setPip(!isPip), [isPip, setPip]);

  const nextTrack = useCallback(() => queueNext(), [queueNext]);
  const previousTrack = useCallback(() => queuePrev(), [queuePrev]);

  // Pause whichever element is not active, then bring the active element in
  // sync with (src, isPlaying). Position is restored from the store on src
  // change — that is the format-switch position sync (F06).
  useEffect(() => {
    const inactive = activeEl === audioRef.current ? videoEl : audioRef.current;
    if (inactive && !inactive.paused) inactive.pause();

    if (!activeEl || !streamUrl) return;
    // Compare the CONTENT ATTRIBUTE, not the .src IDL property: real browsers
    // resolve the property to an absolute URL, so a relative streamUrl would
    // never compare equal and every playbackState update (each timeupdate!)
    // would re-assign src and restart the load (observed in e2e: readyState
    // pinned at 0, networkState NETWORK_NO_SOURCE despite 206 responses;
    // jsdom reflects the raw attribute, which is why unit tests missed it).
    if (activeEl.getAttribute('src') !== streamUrl) {
      activeEl.src = streamUrl;
      activeEl.currentTime = playbackState?.position_seconds ?? 0;
    }
    if (isPlaying) {
      void activeEl.play().catch((err: unknown) => {
        // An AbortError here is our own pause() interrupting this element's
        // pending play() — the element-switch branch above (or a user pause)
        // racing the promise. That is not a playback failure and must not
        // stop the engine. Observed in e2e: the audio->video element switch
        // rejected the audio's play(), this catch killed global playback,
        // and the video then stayed paused with a valid src.
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setPlaying(false);
      });
    } else if (!activeEl.paused) {
      activeEl.pause();
    }
  }, [activeEl, streamUrl, isPlaying, playbackState, setPlaying]);

  // Media element -> store: time, duration, and queue advance on end.
  useEffect(() => {
    const el = activeEl;
    if (!el) return;
    const onTime = () => setPlaybackState({ position_seconds: el.currentTime });
    const onMeta = () => {
      if (Number.isFinite(el.duration) && el.duration > 0) {
        setPlaybackState({ duration_seconds: el.duration });
      }
    };
    // Repeat 'one' loops on the NATURAL end only (a manual Next still skips),
    // so it lives here rather than in the slice's nextTrack. Restarting the
    // same element in place: the slice writes no state for 'one', so nothing
    // downstream would re-trigger playback, and the stream is already loaded.
    const onEnded = () => {
      if (useQueueStore.getState().repeatMode === 'one') {
        el.currentTime = 0;
        el.play().catch(() => setPlaying(false));
        return;
      }
      queueNext();
    };
    const onError = () => {
      setPlaying(false);
      addToast({
        title: 'Stream error',
        description: 'The media element failed to load this stream. The instance may be unhealthy — try another one.',
        variant: 'danger',
      });
    };
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('loadedmetadata', onMeta);
    el.addEventListener('ended', onEnded);
    el.addEventListener('error', onError);
    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('loadedmetadata', onMeta);
      el.removeEventListener('ended', onEnded);
      el.removeEventListener('error', onError);
    };
  }, [activeEl, setPlaybackState, queueNext, addToast, setPlaying]);

  // Keep both elements' volume/rate in sync so a format switch is seamless.
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
    if (videoEl) videoEl.volume = volume;
  }, [volume, videoEl]);
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = playbackRate;
    if (videoEl) videoEl.playbackRate = playbackRate;
  }, [playbackRate, videoEl]);

  // Auto-advance: when the queue's current ITEM changes while playing,
  // continue with it (queue items queued from the feed carry their episode).
  // Keyed on queue-item IDENTITY (its id), not the index number nor the
  // episode: removing the playing item (F05-N1) leaves currentIndex unchanged
  // but shifts a new item into it; reordering moves the playing item to a new
  // index without changing it (must NOT restart, review #6); and the same
  // episode queued twice is two items, so advancing between them still plays.
  // Item ids survive setPlayMode/position rewrites, so unrelated edits are
  // ignored too.
  const lastItemIdRef = useRef<string | undefined>(items[currentIndex]?.id);
  useEffect(() => {
    const item = items[currentIndex];
    if (item?.id === lastItemIdRef.current) return;
    lastItemIdRef.current = item?.id;
    const ep = item?.episode;
    if (isPlaying && ep) {
      playRef.current(ep, isAudioModeRef.current ? 'audio' : 'video');
    } else if (isPlaying && !ep) {
      setPlaying(false);
    }
  }, [currentIndex, items, isPlaying, setPlaying]);

  const position = playbackState?.position_seconds ?? 0;
  const duration = playbackState?.duration_seconds ?? 0;

  const value: PlayerContextType = {
    currentEpisode: currentEpisode ?? items[currentIndex]?.episode ?? null,
    isPlaying,
    playbackFormat,
    isAudioMode,
    isPip,
    volume,
    playbackRate,
    progress: duration > 0 ? (position / duration) * 100 : 0,
    currentTime: position,
    duration,
    play,
    load,
    pause,
    togglePlay,
    seek,
    setVolume,
    setPlaybackRate,
    setAudioMode,
    togglePip,
    nextTrack,
    previousTrack,
    registerVideoElement,
  };

  return (
    <PlayerContext.Provider value={value}>
      {/* Hidden audio engine: hosts all audio playback and the audio side of
          format switching. The video element is registered by PlayerScreen. */}
      <audio ref={audioRef} hidden preload="metadata" />
      {children}
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const context = useContext(PlayerContext);
  if (!context) {
    throw new Error('usePlayer must be used within a PlayerProvider');
  }
  return context;
}
