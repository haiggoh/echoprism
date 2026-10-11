import { create } from 'zustand';
import { PlaybackState, PlayMode } from '../../types';

interface PlayerState {
  playbackState: PlaybackState | null;
  isPlaying: boolean;
  isAudioMode: boolean;
  isPip: boolean;
  volume: number;
  playbackRate: number;
  currentInstanceId?: string;
  
  // Actions
  setPlaybackState: (state: Partial<PlaybackState>) => void;
  setPlaying: (playing: boolean) => void;
  setPosition: (position: number) => void;
  setDuration: (duration: number) => void;
  setPlaybackRate: (rate: number) => void;
  setVolume: (volume: number) => void;
  setAudioMode: (mode: boolean) => void;
  setPip: (pip: boolean) => void;
  setInstance: (instanceId?: string) => void;
  reset: () => void;
}

const initialPlaybackState: PlaybackState = {
  user_id: '',
  position_seconds: 0,
  duration_seconds: 0,
  playback_rate: 1.0,
  volume: 1.0,
  is_audio_mode: false,
  is_pip: false,
  last_updated: new Date().toISOString(),
};

export const usePlayerStore = create<PlayerState>((set) => ({
  playbackState: null,
  isPlaying: false,
  isAudioMode: false,
  isPip: false,
  volume: 1.0,
  playbackRate: 1.0,
  currentInstanceId: undefined,

  setPlaybackState: (state) => set((prev) => ({
    playbackState: { ...prev.playbackState, ...state, user_id: 'current-user' } as any,
  })),
  
  setPlaying: (playing) => set({ isPlaying: playing }),
  setPosition: (position) => set((state) => ({
    playbackState: state.playbackState ? { ...state.playbackState, position_seconds: position } : null,
  })),
  setDuration: (duration) => set((state) => ({
    playbackState: state.playbackState ? { ...state.playbackState, duration_seconds: duration } : null,
  })),
  setPlaybackRate: (rate) => set({ playbackRate: rate }),
  setVolume: (volume) => set({ volume: Math.max(0, Math.min(1, volume)) }),
  setAudioMode: (mode) => set({ isAudioMode: mode }),
  setPip: (pip) => set({ isPip: pip }),
  setInstance: (instanceId) => set({ currentInstanceId: instanceId }),
  reset: () => set({ 
    playbackState: null, 
    isPlaying: false, 
    isAudioMode: false, 
    isPip: false 
  }),
}));

// Selectors
export const selectIsPlaying = (state) => state.isPlaying;
export const selectIsAudioMode = (state) => state.isAudioMode;
export const selectVolume = (state) => state.volume;
export const selectPlaybackRate = (state) => state.playbackRate;
export const selectCurrentPosition = (state) => state.playbackState?.position_seconds ?? 0;
export const selectDuration = (state) => state.playbackState?.duration_seconds ?? 0;
export const selectProgress = (state) => {
  const { playbackState } = state;
  if (!playbackState || !playbackState.duration_seconds) return 0;
  return (playbackState.position_seconds / playbackState.duration_seconds) * 100;
};
