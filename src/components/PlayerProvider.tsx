import { createContext, useContext, useState, useCallback, ReactNode } from 'react';
import { usePlayerStore } from '../../store/slices/playerSlice';
import { useQueueStore } from '../../store/slices/queueSlice';

interface PlayerContextType {
  // State
  currentEpisode: any;
  isPlaying: boolean;
  isAudioMode: boolean;
  isPip: boolean;
  volume: number;
  playbackRate: number;
  progress: number;
  currentTime: number;
  duration: number;
  
  // Actions
  play: (episode: any, mode?: 'video' | 'audio' | 'unified') => void;
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

const PlayerContext = createContext<{
  currentEpisode: any;
  isPlaying: boolean;
  isAudioMode: boolean;
  isPip: boolean;
  volume: number;
  playbackRate: number;
  progress: number;
  currentTime: number;
  duration: number;
  play: (episode: any, mode?: 'video' | 'audio' | 'unified') => void;
  pause: () => void;
  togglePlay: () => void;
  seek: (position: number) => void;
  setVolume: (volume: number) => void;
  setPlaybackRate: (rate: number) => void;
  setAudioMode: (mode: boolean) => void;
  togglePip: () => void;
  nextTrack: () => void;
  previousTrack: () => void;
} | undefined>(undefined);

export function PlayerProvider({ children }: { children: ReactNode }) {
  const { isPlaying, isAudioMode, isPip, volume, playbackRate, setPlaying, setAudioMode, setPip, setVolume, setPlaybackRate } = usePlayerStore();
  const { items, currentIndex, nextTrack, previousTrack } = useQueueStore();
  const currentItem = items[currentIndex];
  const episode = currentItem?.episode;

  const play = useCallback((ep: any, mode?: 'video' | 'audio' | 'unified') => {
    // Play episode
  }, []);

  const pause = useCallback(() => {
    // Pause
  }, []);

  const togglePlay = useCallback(() => {
    // Toggle play/pause
  }, []);

  const seek = useCallback((position: number) => {
    // Seek to position
  }, []);

  const setVolume = useCallback((vol: number) => {
    // Set volume
  }, []);

  const setPlaybackRate = useCallback((rate: number) => {
    // Set playback rate
  }, []);

  const setAudioMode = useCallback((mode: boolean) => {
    // Set audio mode
  }, []);

  const togglePip = useCallback(() => {
    // Toggle PiP
  }, []);

  const nextTrack = useCallback(() => {
    // Next track
  }, []);

  const previousTrack = useCallback(() => {
    // Previous track
  }, []);

  const value = {
    currentEpisode: null,
    isPlaying: false,
    isAudioMode: false,
    isPip: false,
    volume: 1,
    playbackRate: 1,
    progress: 0,
    currentTime: 0,
    duration: 0,
    play: () => {},
    pause: () => {},
    togglePlay: () => {},
    seek: () => {},
    setVolume: () => {},
    setPlaybackRate: () => {},
    setAudioMode: () => {},
    togglePip: () => {},
    nextTrack: () => {},
    previousTrack: () => {},
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
