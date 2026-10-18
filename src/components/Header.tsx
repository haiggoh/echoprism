import { useUIStore } from '../store/slices/uiSlice';
import { useQueueStore } from '../store/slices/queueSlice';
import { PrismConvergeToggle } from './player/PrismConvergeToggle';
import { PrismLogo } from './ui/PrismLogo';
import { useConvergence } from '../hooks/useConvergence';

export function Header() {
  const { toggleSidebar } = useUIStore();
  const { audioOnlyMode, setAudioOnlyMode } = useQueueStore();
  const { state, setMode } = useConvergence();

  return (
    <header className="h-16 bg-bg-elevated border-b border-border flex items-center justify-between px-4">
      {/* Left: Menu toggle + Search */}
      <div className="flex items-center gap-4">
        <button
          onClick={toggleSidebar}
          className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors lg:hidden"
          aria-label="Toggle sidebar"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>

        {/* Search */}
        <div className="relative hidden sm:block">
          <input
            type="search"
            placeholder="Search videos, podcasts, channels..."
            className="w-64 px-4 py-2 pl-10 bg-surface border border-border rounded-lg text-text placeholder-text-muted focus:border-input focus:outline-none focus:ring-2 focus:ring-focus-ring transition-all"
          />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
        </div>
      </div>

      {/* Center: App title (collapsed sidebar) */}
      <div className="hidden lg:flex items-center">
        <div className="w-16 h-8 bg-gradient-to-br from-stream-video to-stream-audio rounded-xl flex items-center justify-center">
          <PrismLogo size={28} audioOnly={audioOnlyMode} />
        </div>
      </div>

      {/* Right: Audio mode toggle + PrismConvergeToggle */}
      <div className="flex items-center gap-4">
        {/* Audio mode toggle */}
        <label className="flex items-center gap-2 cursor-pointer hidden sm:flex">
          <input
            type="checkbox"
            checked={audioOnlyMode}
            onChange={(e) => setAudioOnlyMode(e.target.checked)}
            className="w-4 h-4 accent-accent rounded border-border"
            aria-label="Audio only mode"
          />
          <span className="text-sm text-text-muted hidden md:inline">Audio only</span>
        </label>

        {/* PrismConvergeToggle — audioOnly reflects the actual playback
            preference: the video stream pales whenever audio-only is on */}
        <PrismConvergeToggle mode={state.mode} onModeChange={setMode} size="md" audioOnly={audioOnlyMode} />

        {/* Notifications — accessible name must contain the visible badge text */}
        <button className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors relative" aria-label="Notifications, 3 unread">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
            <path d="M13.73 21a2 2 0 0 1-3.4 0"></path>
          </svg>
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-danger rounded-full text-xs text-white flex items-center justify-center">3</span>
        </button>

        {/* User avatar */}
        <div className="w-8 h-8 bg-gradient-to-br from-stream-video to-stream-audio rounded-full flex items-center justify-center">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
        </div>
      </div>
    </header>
  );
}
