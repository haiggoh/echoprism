import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { usePlayerStore } from '../store/slices/playerSlice';
import { useQueueStore } from '../store/slices/queueSlice';
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

  const [currentEpisode, setCurrentEpisode] = useState<Episode | null>(null);

  const play = useCallback((ep: Episode, mode?: PlayMode) => {
    setCurrentEpisode(ep);
    if (mode) setAudioMode(mode === 'audio');
    setPlaybackState({
      episode_id: ep.id,
      position_seconds: ep.progress_seconds ?? 0,
      duration_seconds: ep.duration_seconds,
    });
    setPlaying(true);
  }, [setAudioMode, setPlaybackState, setPlaying]);

  const pause = useCallback(() => setPlaying(false), [setPlaying]);

  const togglePlay = useCallback(() => setPlaying(!isPlaying), [isPlaying, setPlaying]);

  const seek = useCallback(
    (position: number) => setPlaybackState({ position_seconds: position }),
    [setPlaybackState]
  );

  const togglePip = useCallback(() => setPip(!isPip), [isPip, setPip]);

  const nextTrack = useCallback(() => queueNext(), [queueNext]);

  const previousTrack = useCallback(() => queuePrev(), [queuePrev]);

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
  };

  return (
    <PlayerContext.Provider value={value}>
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
