import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useUIStore } from '../store/slices/uiSlice';
import { useQueueStore } from '../store/slices/queueSlice';
import { PrismConvergeToggle } from './player/PrismConvergeToggle';
import { useConvergence } from '../hooks/useConvergence';

/**
 * Live-test honesty pass (2026-10-23): this header carried three things
 * that lied — a placeholder bell hardcoded to "3" (nothing real is behind
 * it; episode notifications become a feature when a seen-state exists), a
 * gradient avatar implying an account system this single-user local app
 * does not have, and a third wide brand mark between the nav icon and the
 * prism display. All three are gone. The search input USED to be decoration
 * too (no handler at all); it is now real: Enter navigates to /search with
 * the query, which the Search screen prefills and submits.
 */
export function Header() {
  const { toggleSidebar } = useUIStore();
  const { audioOnlyMode, setAudioOnlyMode } = useQueueStore();
  const { state, setMode } = useConvergence();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const submitSearch = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    const q = search.trim();
    if (q.length === 0) return;
    navigate(`/search?q=${encodeURIComponent(q)}`);
  };

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

        {/* Search — the quick entry to the full Search screen. Its label is
            deliberately DISTINCT from the Search screen's own field: two
            inputs with one accessible name is its own a11y defect, and the
            specs address them by name. */}
        <div className="relative hidden sm:block">
          <input
            type="search"
            placeholder="Quick search…"
            aria-label="Quick search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={submitSearch}
            className="w-64 px-4 py-2 pl-10 bg-surface border border-border rounded-lg text-text placeholder-text-muted focus:border-input focus:outline-none focus:ring-2 focus:ring-focus-ring transition-all"
          />
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8"></circle>
            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          </svg>
        </div>
      </div>

      {/* Right: Audio mode toggle + PrismConvergeToggle */}
      <div className="flex items-center gap-4">
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
      </div>
    </header>
  );
}
