import { createContext, useContext, useState, useRef, useCallback, useEffect, ReactNode } from 'react';
import { usePlayerStore } from '../store/slices/playerSlice';
import { useQueueStore } from '../store/slices/queueSlice';
import { episodeCommands } from '../hooks/useTauriCommands';
import { useToasts } from './ui/Toaster';
import { Episode, PlayMode } from '../types';

interface PlayerContextType {
  currentEpisode: Episode | null;
  isPlaying: boolean;
  isAudioMode: boolean;
  isPip: boolean;
  volume: number;
  playbackRate: number;
  progress: number;
  currentTime: number;
  duration: number;
  play: (episode: Episode, mode?: PlayMode) => void;
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
    setAudioMode,
    setPip,
    setVolume,
    setPlaybackRate,
  } = usePlayerStore();
  const { items, currentIndex, nextTrack: queueNext, previousTrack: queuePrev } = useQueueStore();
  const { addToast } = useToasts();

  const [currentEpisode, setCurrentEpisode] = useState<Episode | null>(null);
  const [streamUrl, setStreamUrl] = useState<string | null>(null);
  const [videoEl, setVideoEl] = useState<HTMLVideoElement | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentEpisodeRef = useRef<Episode | null>(null);
  const isAudioModeRef = useRef(isAudioMode);
  isAudioModeRef.current = isAudioMode;
  // play() re-created each render; auto-advance reads it through a ref to avoid effect loops.
  const playRef = useRef<(ep: Episode, mode?: PlayMode) => void>(() => {});

  const hasVideo = !!currentEpisode && (!!currentEpisode.video_id || !!currentEpisode.video_url);
  // The engine plays through exactly one element: video when the episode has it
  // and audio mode is off, the hidden audio element otherwise.
  const activeEl: HTMLMediaElement | null =
    !isAudioMode && hasVideo && videoEl ? videoEl : audioRef.current;

  const registerVideoElement = useCallback((el: HTMLVideoElement | null) => {
    setVideoEl(el);
  }, []);

  const play = useCallback(
    (ep: Episode, mode?: PlayMode) => {
      currentEpisodeRef.current = ep;
      setCurrentEpisode(ep);
      const wantAudio = mode ? mode === 'audio' : isAudioModeRef.current;
      setAudioMode(wantAudio);
      setPlaying(true); // optimistic; the sync effect starts playback once the src is set
      setPlaybackState({
        episode_id: ep.id,
        position_seconds: ep.progress_seconds ?? 0,
        duration_seconds: ep.duration_seconds,
      });
      episodeCommands
        .stream(ep.id, wantAudio ? 'audio' : 'video')
        .then((info) => setStreamUrl(info.url))
        .catch(() => {
          setPlaying(false);
          setStreamUrl(null);
          addToast({
            title: 'Playback unavailable',
            description:
              'Could not resolve a stream for this episode. Add a healthy Invidious/Piped instance in Settings first.',
            variant: 'danger',
          });
        });
    },
    [setAudioMode, setPlaying, setPlaybackState, addToast]
  );
  playRef.current = play;

  const pause = useCallback(() => setPlaying(false), [setPlaying]);

  const togglePlay = useCallback(() => setPlaying(!isPlaying), [isPlaying, setPlaying]);

  const seek = useCallback(
    (position: number) => {
      setPlaybackState({ position_seconds: position });
      const el = !isAudioModeRef.current && videoEl ? videoEl : audioRef.current;
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
    if (activeEl.src !== streamUrl) {
      activeEl.src = streamUrl;
      activeEl.currentTime = playbackState?.position_seconds ?? 0;
    }
    if (isPlaying) {
      void activeEl.play().catch(() => setPlaying(false));
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
    const onEnded = () => queueNext();
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
  }, [activeEl, setPlaybackState, queueNext, addToast]);

  // Keep both elements' volume/rate in sync so a format switch is seamless.
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = volume;
    if (videoEl) videoEl.volume = volume;
  }, [volume, videoEl]);
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = playbackRate;
    if (videoEl) videoEl.playbackRate = playbackRate;
  }, [playbackRate, videoEl]);

  // Auto-advance: when the queue index changes while playing, continue with
  // the new current item (queue items queued from the feed carry their episode).
  const lastIndexRef = useRef(currentIndex);
  useEffect(() => {
    if (currentIndex === lastIndexRef.current) return;
    lastIndexRef.current = currentIndex;
    const ep = items[currentIndex]?.episode;
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
    isAudioMode,
    isPip,
    volume,
    playbackRate,
    progress: duration > 0 ? (position / duration) * 100 : 0,
    currentTime: position,
    duration,
    play,
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
