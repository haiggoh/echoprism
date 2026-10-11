import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useUIStore } from './store/slices/uiSlice';
import { useQueueStore } from './store/slices/queueSlice';
import { usePlayerStore } from './store/slices/playerSlice';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { MiniPlayer } from './components/MiniPlayer';
import { FeedScreen } from './components/screens/FeedScreen';
import { QueueScreen } from './components/screens/QueueScreen';
import { PlayerScreen } from './components/screens/PlayerScreen';
import { SearchScreen } from './components/screens/SearchScreen';
import { SettingsScreen } from './components/screens/SettingsScreen';
import { HistoryScreen } from './components/screens/HistoryScreen';
import { DownloadsScreen } from './components/screens/DownloadsScreen';
import { ChannelsScreen } from './components/screens/ChannelsScreen';
import { SmartLinksScreen } from './components/screens/SmartLinksScreen';
import { OnboardingScreen } from './components/screens/OnboardingScreen';
import { PlayerProvider } from './components/PlayerProvider';
import { useTauriCommands } from './hooks/useTauriCommands';
import { ConvergenceProvider } from './hooks/useConvergence';
import { useUIStore } from './store/slices/uiSlice';

function AppRoutes() {
  const { currentRoute, setViewMode } = useUIStore();
  const [initialized, setInitialized] = useState(false);

  // Check if onboarding is needed
  useEffect(() => {
    const checkInit = async () => {
      try {
        // Check if user has completed onboarding
        const prefs = await window.__TAURI__.invoke('settings:get');
        if (!prefs || Object.keys(prefs).length === 0) {
          setViewMode('onboarding');
        }
        setInitialized(true);
      } catch {
        setInitialized(true);
      }
    };
    checkInit();
  }, []);

  if (!initialized) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-bg">
        <div className="convergence-loader" role="status" aria-label="Loading EchoPrism">
          <div className="convergence-loader-beams" />
          <div className="convergence-loader-prism" />
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen w-full overflow-hidden bg-bg">
      <Sidebar />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header />
        <main className="flex-1 overflow-auto" id="main-content">
          <Routes>
            <Route path="/onboarding" element={<OnboardingScreen />} />
            <Route path="/feed" element={<FeedScreen />} />
            <Route path="/queue" element={<QueueScreen />} />
            <Route path="/player/:episodeId" element={<PlayerScreen />} />
            <Route path="/search" element={<SearchScreen />} />
            <Route path="/settings" element={<SettingsScreen />} />
            <Route path="/history" element={<HistoryScreen />} />
            <Route path="/downloads" element={<DownloadsScreen />} />
            <Route path="/channels" element={<ChannelsScreen />} />
            <Route path="/smart-links" element={<SmartLinksScreen />} />
            <Route path="/" element={<Navigate to="/feed" replace />} />
            <Route path="*" element={<Navigate to="/feed" replace />} />
          </Routes>
        </main>
        <MiniPlayer />
      </div>
    </div>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AppRoutes />
    </BrowserRouter>
  );
}

export default App;
