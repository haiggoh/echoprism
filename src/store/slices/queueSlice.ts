import { create } from 'zustand';
import { Episode, Queue, QueueItem } from '../../types';

interface QueueState {
  queue: Queue | null;
  items: QueueItem[];
  currentIndex: number;
  repeatMode: 'off' | 'one' | 'all';
  shuffle: boolean;
  isLoading: boolean;
  error: string | null;
  /** F05: the feed episode currently being dragged, so a queue drop target
   *  can pick it up. Module store (not local state) because the drag STARTS
   *  in the feed and the DROP lands in the queue screen. */
  draggedEpisode: Episode | null;

  // Actions
  setQueue: (queue: Queue | null) => void;
  setItems: (items: QueueItem[]) => void;
  addItem: (item: Omit<QueueItem, 'id' | 'position'>) => void;
  playNextItem: (item: Omit<QueueItem, 'id' | 'position'>) => void;
  /** Play now WITHOUT discarding the queue (owner, 2026-11-02): insert right
   *  after the current item (index 0 when empty) and move the cursor onto it. */
  playNowItem: (item: Omit<QueueItem, 'id' | 'position'>) => void;
  removeItem: (itemId: string) => void;
  reorderItems: (fromIndex: number, toIndex: number) => void;
  clearQueue: () => void;
  setCurrentIndex: (index: number) => void;
  incrementIndex: () => void;
  decrementIndex: () => void;
  setRepeatMode: (mode: 'off' | 'one' | 'all') => void;
  setShuffle: (shuffle: boolean) => void;
  setPlayMode: (itemId: string, mode: 'video' | 'audio' | 'unified') => void;
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
  setDraggedEpisode: (episode: Episode | null) => void;
  nextTrack: () => void;
  previousTrack: () => void;
}

/**
 * Batch 4 item 1 (owner 2026-11-02): an episode appears at most once in the
 * queue — re-queuing an existing episode MOVES it to the target slot instead
 * of inserting a duplicate. The cursor keeps pointing at the episode that was
 * playing (`moveCursor` — used by playNowItem — moves it onto the new clip).
 */
function moveOrInsert(
  state: QueueState,
  item: Omit<QueueItem, 'id' | 'position'>,
  target: number,
  moveCursor: boolean,
): { items: QueueItem[]; currentIndex: number } {
  const cursorEpisodeId = state.items[state.currentIndex]?.episode_id;
  const items = [...state.items];
  const existing = items.findIndex((it) => it.episode_id === item.episode_id);
  if (existing !== -1) items.splice(existing, 1);
  const at = Math.max(0, Math.min(target, items.length));
  items.splice(at, 0, { ...item, id: crypto.randomUUID(), position: at });
  const withPositions = items.map((it, i) => ({ ...it, position: i }));
  let currentIndex = moveCursor
    ? at
    : withPositions.findIndex((it) => it.episode_id === cursorEpisodeId);
  if (currentIndex < 0) currentIndex = Math.max(0, Math.min(state.currentIndex, withPositions.length - 1));
  return { items: withPositions, currentIndex };
}

export const useQueueStore = create<QueueState>((set, get) => ({
  queue: null,
  items: [],
  currentIndex: 0,
  repeatMode: 'off',
  shuffle: false,
  isLoading: false,
  error: null,
  draggedEpisode: null,

  setQueue: (queue) => set({ queue }),
  setItems: (items) => set({ items }),
  
  addItem: (item) => set((state) => moveOrInsert(state, item, state.items.length, false)),

  playNextItem: (item) => set((state) => moveOrInsert(state, item, state.currentIndex + 1, false)),

  // Owner 2026-11-02 (batch 4 item 7): play now inserts AT the cursor — the
  // new clip goes in front of the current item, the rest of the queue keeps
  // its order — and the cursor moves onto the new clip.
  playNowItem: (item) => set((state) => moveOrInsert(state, item, state.currentIndex, true)),

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
  
  setPlayMode: (itemId, mode) => set((state) => ({
    items: state.items.map(item => 
      item.id === itemId ? { ...item, play_mode: mode } : item
    ),
  })),
  
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
  setDraggedEpisode: (draggedEpisode) => set({ draggedEpisode }),
  
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
