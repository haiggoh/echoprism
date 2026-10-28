import { create } from 'zustand';
import { PlaybackState } from '../../types';

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
  /** The level a mute was taken FROM, so unmuting restores it instead of
   *  jumping to 1.0. Live-test batch 2 Task 1. */
  volumeBeforeMute: number;
  toggleMute: () => void;
  setAudioMode: (mode: boolean) => void;
  setPip: (pip: boolean) => void;
  setInstance: (instanceId?: string) => void;
  reset: () => void;
}

export const usePlayerStore = create<PlayerState>((set) => ({
  playbackState: null,
  isPlaying: false,
  isAudioMode: false,
  isPip: false,
  volume: 1.0,
  playbackRate: 1.0,
  volumeBeforeMute: 1.0,
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
  toggleMute: () =>
    set((state) => {
      if (state.volume > 0) {
        // Remember where we muted from — a manual drag to 0 is the same
        // state and should not be treated as a mute to undo.
        return { volume: 0, volumeBeforeMute: state.volume };
      }
      const restore = state.volumeBeforeMute > 0 ? state.volumeBeforeMute : 1.0;
      return { volume: restore };
    }),
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
export const selectIsPlaying = (state: PlayerState) => state.isPlaying;
export const selectIsAudioMode = (state: PlayerState) => state.isAudioMode;
export const selectVolume = (state: PlayerState) => state.volume;
export const selectPlaybackRate = (state: PlayerState) => state.playbackRate;
export const selectCurrentPosition = (state: PlayerState) => state.playbackState?.position_seconds ?? 0;
export const selectDuration = (state: PlayerState) => state.playbackState?.duration_seconds ?? 0;
export const selectProgress = (state: PlayerState) => {
  const { playbackState } = state;
  if (!playbackState || !playbackState.duration_seconds) return 0;
  return (playbackState.position_seconds / playbackState.duration_seconds) * 100;
};
