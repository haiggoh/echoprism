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
  
  // Removal is position-aware: the cursor must keep pointing at the PLAYING
  // episode, so a removal BEFORE it shifts the index down, a removal at it
  // keeps the slot (the next episode slides in — or the previous one when
  // the last item is removed), and a removal after it changes nothing. The
  // old clamp (min(currentIndex, length-2)) ignored the removed position and
  // audibly skipped playback when a non-playing item before the cursor went
  // away. max(0, …) keeps the index in contract when the only item goes.
  removeItem: (itemId) => set((state) => {
    const removedIndex = state.items.findIndex((item) => item.id === itemId);
    const items = state.items
      .filter((item) => item.id !== itemId)
      .map((item, index) => ({ ...item, position: index }));
    if (removedIndex === -1) return { items };
    let currentIndex = state.currentIndex;
    if (removedIndex < currentIndex) currentIndex -= 1;
    else if (removedIndex === currentIndex) {
      currentIndex = Math.max(0, Math.min(currentIndex, items.length - 1));
    }
    return { items, currentIndex };
  }),

  // Reorder tracks the playing episode to its new slot. Moving the cursor
  // episode itself carries the cursor along; moving other items shifts the
  // cursor only when they cross it (removed-before + insert-at-or-after
  // shifts down by one, and vice versa). The old toIndex-keyed math guessed
  // from the drop target alone and landed the cursor on the wrong episode
  // (or out of range, stopping playback) for every drag involving the
  // playing item.
  reorderItems: (fromIndex, toIndex) => set((state) => {
    const items = [...state.items];
    const [removed] = items.splice(fromIndex, 1);
    items.splice(toIndex, 0, removed);
    const { currentIndex } = state;
    let nextIndex = currentIndex;
    if (fromIndex === currentIndex) {
      nextIndex = toIndex;
    } else if (fromIndex < currentIndex && toIndex >= currentIndex) {
      nextIndex = currentIndex - 1;
    } else if (fromIndex > currentIndex && toIndex <= currentIndex) {
      nextIndex = currentIndex + 1;
    }
    return {
      items: items.map((item, index) => ({ ...item, position: index })),
      currentIndex: nextIndex,
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
    // Live-test Task 8: previous means PREVIOUS. This used to pick a RANDOM
    // index when shuffle was on, so pressing Back could jump forward, stay
    // put, or land anywhere — the owner's 11:20 decision is explicit that
    // previous must always go back, and shuffle reorders the queue, it does
    // not redefine what "back" means. (Proven by the seeded-mutation test in
    // queue-navigation.test.tsx: with Math.random pinned to 0.99 the old
    // branch landed on the LAST item.)
    const { currentIndex } = get();
    if (currentIndex > 0) {
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
