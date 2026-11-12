import { useState, useEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { MiniPlayer } from './components/MiniPlayer';
import { FeedScreen } from './components/screens/FeedScreen';
import { QueueScreen } from './components/screens/QueueScreen';
import { PlaylistsScreen } from './components/screens/PlaylistsScreen';
import { PlayerScreen } from './components/screens/PlayerScreen';
import { SearchScreen } from './components/screens/SearchScreen';
import { SettingsScreen } from './components/screens/SettingsScreen';
import { HistoryScreen } from './components/screens/HistoryScreen';
import { DownloadsScreen } from './components/screens/DownloadsScreen';
import { ChannelsScreen } from './components/screens/ChannelsScreen';
import { ChannelScreen } from './components/screens/ChannelScreen';
import { SmartLinksScreen } from './components/screens/SmartLinksScreen';
import { OnboardingScreen } from './components/screens/OnboardingScreen';
import { PlayerProvider } from './components/PlayerProvider';
import { SplashScreen } from './components/SplashScreen';
import { settingsCommands } from './hooks/useTauriCommands';

/** Round 6 Task 6 (echoprism-splash-screen): the React splash stays until init
 *  has finished AND at least this long has passed since mount. Measured in the
 *  dev build 2026-11-05: the first settings read resolves ~12 ms after the
 *  splash first renders, so without this floor the splash was on screen for
 *  only milliseconds and nobody saw it (the pre-JS frame is covered by the
 *  static pre-splash in index.html). */
export const SPLASH_MIN_MS = 900;

function AppRoutes() {
  const navigate = useNavigate();
  const [initialized, setInitialized] = useState(false);
  const [splashDone, setSplashDone] = useState(false);
  const mountedAtRef = useRef(Date.now());

  // Minimum display time: once init has finished, keep the splash up until
  // SPLASH_MIN_MS since mount (fake-timer friendly — all via Date.now/setTimeout).
  useEffect(() => {
    if (!initialized) return;
    const remaining = SPLASH_MIN_MS - (Date.now() - mountedAtRef.current);
    if (remaining <= 0) {
      setSplashDone(true);
      return;
    }
    const timer = setTimeout(() => setSplashDone(true), remaining);
    return () => clearTimeout(timer);
  }, [initialized]);

  // Check if onboarding is needed
  useEffect(() => {
    const checkInit = async () => {
      try {
        // Check if user has completed onboarding
        const prefs = await settingsCommands.get();
        if (!prefs || Object.keys(prefs).length === 0) {
          navigate('/onboarding');
        }
      } catch {
        // Backend unreachable or not ready - stay on feed with empty state
      } finally {
        setInitialized(true);
      }
    };
    checkInit();
  }, [navigate]);

  if (!initialized || !splashDone) {
    // Batch 4 item 9 (owner 2026-11-02): a real splash — pulsing logo + version.
    // Round 6 Task 6: also held for SPLASH_MIN_MS so it is actually seen.
    return <SplashScreen />;
  }

  return (
    <PlayerProvider>
      <div className="flex h-screen w-full overflow-hidden bg-bg">
        <Sidebar />
        <div className="flex-1 flex flex-col overflow-hidden">
          <Header />
          <main className="flex-1 overflow-auto" id="main-content">
            <Routes>
              <Route path="/onboarding" element={<OnboardingScreen />} />
              <Route path="/feed" element={<FeedScreen />} />
              <Route path="/queue" element={<QueueScreen />} />
              <Route path="/playlists" element={<PlaylistsScreen />} />
              <Route path="/player/:episodeId" element={<PlayerScreen />} />
              <Route path="/search" element={<SearchScreen />} />
              <Route path="/settings" element={<SettingsScreen />} />
              <Route path="/history" element={<HistoryScreen />} />
              <Route path="/downloads" element={<DownloadsScreen />} />
              <Route path="/channels" element={<ChannelsScreen />} />
              {/* Live-test Task 10: a channel is a destination, not an inert
                  row — reached by route so it is linkable and back-navigable. */}
              <Route path="/channels/:channelId" element={<ChannelScreen />} />
              <Route path="/smart-links" element={<SmartLinksScreen />} />
              <Route path="/" element={<Navigate to="/feed" replace />} />
              <Route path="*" element={<Navigate to="/feed" replace />} />
            </Routes>
          </main>
          <MiniPlayer />
        </div>
      </div>
    </PlayerProvider>
  );
}

function App() {
  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AppRoutes />
    </BrowserRouter>
  );
}

export default App;
