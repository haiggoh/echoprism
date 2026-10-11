import { createSlice, PayloadAction } from 'zustand';
import { create } from 'zustand';
import { ViewMode, UIState } from '../../types';

interface UIStore extends UIState {
  setViewMode: (mode: ViewMode) => void;
  toggleSidebar: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setMiniPlayerOpen: (open: boolean) => void;
  setFullscreenPlayer: (open: boolean) => void;
  setCurrentRoute: (route: string) => void;
  goBack: () => void;
}

const initialState: UIState = {
  sidebarOpen: true,
  miniPlayerOpen: false,
  fullscreenPlayer: false,
  currentRoute: '/feed',
  previousRoute: '/feed',
  sidebarCollapsed: false,
};

export const useUIStore = create<UIStore>()((set, get) => ({
  ...initialState,
  setViewMode: (mode) => set({ 
    currentRoute: mode === 'feed' ? '/feed' : 
                   mode === 'queue' ? '/queue' :
                   mode === 'player' ? '/player' :
                   mode === 'search' ? '/search' :
                   mode === 'settings' ? '/settings' :
                   mode === 'history' ? '/history' :
                   mode === 'downloads' ? '/downloads' :
                   mode === 'channels' ? '/channels' :
                   mode === 'smart-links' ? '/smart-links' : '/feed'
  }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setSidebarCollapsed: (collapsed) => set({ sidebarCollapsed: collapsed }),
  setMiniPlayerOpen: (open) => set({ miniPlayerOpen: open }),
  setFullscreenPlayer: (open) => set({ fullscreenPlayer: open }),
  setCurrentRoute: (route) => set((state) => ({ 
    previousRoute: state.currentRoute, 
    currentRoute: route 
  })),
  goBack: () => set((state) => ({ 
    currentRoute: state.previousRoute, 
    previousRoute: state.currentRoute 
  })),
}));

// Selectors
export const selectSidebarOpen = (state: UIState) => state.sidebarOpen;
export const selectMiniPlayerOpen = (state: UIState) => state.miniPlayerOpen;
export const selectFullscreenPlayer = (state: UIState) => state.fullscreenPlayer;
export const selectCurrentRoute = (state: UIState) => state.currentRoute;
export const selectSidebarCollapsed = (state: UIState) => state.sidebarCollapsed;
