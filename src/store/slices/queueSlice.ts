import { create } from 'zustand';
import { Queue, QueueItem } from '../../types';

interface QueueState {
  queue: Queue | null;
  items: QueueItem[];
  currentIndex: number;
  repeatMode: 'off' | 'one' | 'all';
  shuffle: boolean;
  audioOnlyMode: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Actions
  setQueue: (queue: Queue | null) => void;
  setItems: (items: QueueItem[]) => void;
  addItem: (item: Omit<QueueItem, 'id' | 'position'>) => void;
  playNextItem: (item: Omit<QueueItem, 'id' | 'position'>) => void;
  removeItem: (itemId: string) => void;
  reorderItems: (fromIndex: number, toIndex: number) => void;
  clearQueue: () => void;
  setCurrentIndex: (index: number) => void;
  incrementIndex: () => void;
  decrementIndex: () => void;
  setRepeatMode: (mode: 'off' | 'one' | 'all') => void;
  setShuffle: (shuffle: boolean) => void;
  setAudioOnlyMode: (mode: boolean) => void;
  setPlayMode: (itemId: string, mode: 'video' | 'audio' | 'unified') => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  nextTrack: () => void;
  previousTrack: () => void;
}

export const useQueueStore = create<QueueState>((set, get) => ({
  queue: null,
  items: [],
  currentIndex: 0,
  repeatMode: 'off',
  shuffle: false,
  audioOnlyMode: false,
  isLoading: false,
  error: null,

  setQueue: (queue) => set({ queue }),
  setItems: (items) => set({ items }),
  
  addItem: (item) => set((state) => ({
    items: [...state.items, {
      ...item,
      id: crypto.randomUUID(),
      position: state.items.length
    }],
  })),

  playNextItem: (item) => set((state) => {
    const next = { ...item, id: crypto.randomUUID(), position: state.currentIndex + 1 };
    const items = [...state.items];
    items.splice(state.currentIndex + 1, 0, next);
    return { items: items.map((it, i) => ({ ...it, position: i })) };
  }),
  
  removeItem: (itemId) => set((state) => ({
    items: state.items
      .filter((item) => item.id !== itemId)
      .map((item, index) => ({ ...item, position: index })),
    currentIndex: Math.min(state.currentIndex, state.items.length - 2),
  })),
  
  reorderItems: (fromIndex, toIndex) => set((state) => {
    const items = [...state.items];
    const [removed] = items.splice(fromIndex, 1);
    items.splice(toIndex, 0, removed);
    return { 
      items: items.map((item, index) => ({ ...item, position: index })),
      currentIndex: toIndex === state.currentIndex ? fromIndex : 
                    toIndex < state.currentIndex ? state.currentIndex + 1 :
                    toIndex > state.currentIndex ? state.currentIndex - 1 : state.currentIndex
    };
  }),
  
  clearQueue: () => set({ items: [], currentIndex: 0 }),
  
  setCurrentIndex: (index) => set({ currentIndex: index }),
  
  incrementIndex: () => set((state) => ({
    currentIndex: Math.min(state.currentIndex + 1, state.items.length - 1),
  })),
  
  decrementIndex: () => set((state) => ({
    currentIndex: Math.max(state.currentIndex - 1, 0),
  })),
  
  setRepeatMode: (mode) => set({ repeatMode: mode }),
  setShuffle: (shuffle) => set({ shuffle }),
  setAudioOnlyMode: (mode) => set({ audioOnlyMode: mode }),
  
  setPlayMode: (itemId, mode) => set((state) => ({
    items: state.items.map(item => 
      item.id === itemId ? { ...item, play_mode: mode } : item
    ),
  })),
  
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  
  nextTrack: () => {
    const { items, currentIndex, repeatMode, shuffle } = get();
    if (items.length === 0) return;
    
    if (shuffle) {
      const nextIndex = Math.floor(Math.random() * items.length);
      set({ currentIndex: nextIndex });
    } else if (currentIndex < items.length - 1) {
      set({ currentIndex: currentIndex + 1 });
    } else if (repeatMode === 'all') {
      set({ currentIndex: 0 });
    } else if (repeatMode === 'one') {
      // Stay on current
    }
  },
  
  previousTrack: () => {
    const { currentIndex, shuffle } = get();
    if (shuffle) {
      const prevIndex = Math.floor(Math.random() * get().items.length);
      set({ currentIndex: prevIndex });
    } else if (currentIndex > 0) {
      set({ currentIndex: currentIndex - 1 });
    }
  },
}));

// Selectors
export const selectCurrentItem = (state: QueueState) => state.items[state.currentIndex] || null;
export const selectQueueItems = (state: QueueState) => state.items;
export const selectCurrentIndex = (state: QueueState) => state.currentIndex;
export const selectRepeatMode = (state: QueueState) => state.repeatMode;
export const selectShuffle = (state: QueueState) => state.shuffle;
export const selectAudioOnlyMode = (state: QueueState) => state.audioOnlyMode;
