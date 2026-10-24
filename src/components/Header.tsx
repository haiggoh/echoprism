import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useUIStore } from '../store/slices/uiSlice';
import { useQueueStore } from '../store/slices/queueSlice';
import { PrismConvergeToggle } from './player/PrismConvergeToggle';
import { useConvergence } from '../hooks/useConvergence';
import { notificationCommands } from '../hooks/useTauriCommands';

/**
 * Live-test honesty pass (2026-10-23): this header carried three things
 * that lied — a placeholder bell hardcoded to "3", a gradient avatar
 * implying an account system this single-user local app does not have, and
 * a third wide brand mark. The avatar and third brand mark are gone. The
 * bell is back for REAL (Phase: episode notifications): its count is the
 * episodes published since you last looked, across subscribed channels;
 * opening the panel marks them seen. The search input USED to be
 * decoration too; it is now real: Enter navigates to /search with the
 * query, which the Search screen prefills and submits.
 */
export function Header() {
  const { toggleSidebar } = useUIStore();
  const { audioOnlyMode, setAudioOnlyMode } = useQueueStore();
  const { state, setMode } = useConvergence();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [bellOpen, setBellOpen] = useState(false);
  const [seenLocally, setSeenLocally] = useState(false);

  const { data: notifications } = useQuery({
    queryKey: ['episode-notifications'],
    queryFn: () => notificationCommands.summary(),
    refetchInterval: 120_000,
  });
  const newCount = seenLocally ? 0 : (notifications?.new_count ?? 0);

  const toggleBell = () => {
    const opening = !bellOpen;
    setBellOpen(opening);
    if (opening) {
      // Opening the panel IS seeing the episodes (YouTube's pattern): the
      // badge clears immediately, the list stays for this render, and the
      // backend's seen instant advances.
      setSeenLocally(true);
      void notificationCommands
        .markSeen()
        .then(() => queryClient.invalidateQueries({ queryKey: ['episode-notifications'] }))
        .catch(() => {});
    }
  };

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

        {/* The REAL bell (episode notifications): count = episodes published
            since the last seen instant across subscribed channels. */}
        <div className="relative">
          <button
            className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors relative"
            aria-label={`Episode notifications${newCount > 0 ? `, ${newCount} new` : ''}`}
            aria-expanded={bellOpen}
            onClick={toggleBell}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
              <path d="M13.73 21a2 2 0 0 1-3.4 0"></path>
            </svg>
            {newCount > 0 && (
              <span data-testid="notification-count" className="absolute -top-1 -right-1 min-w-4 h-4 px-1 bg-danger rounded-full text-xs text-text-inverse flex items-center justify-center">
                {newCount}
              </span>
            )}
          </button>
          {bellOpen && (
            <>
              {/* click-away layer */}
              <div className="fixed inset-0 z-40" aria-hidden="true" onClick={() => setBellOpen(false)} />
              <div
                role="region"
                aria-label="New episodes"
                className="absolute right-0 top-full mt-2 w-80 bg-bg-elevated border border-border rounded-lg shadow-pop z-50"
              >
                <p className="px-3 py-2 text-xs text-text-muted border-b border-border">
                  {notifications && notifications.episodes.length > 0
                    ? 'New episodes since your last visit'
                    : 'You are all caught up'}
                </p>
                <ul aria-label="New episodes">
                  {(notifications?.episodes ?? []).map((item) => (
                    <li key={item.id}>
                      <button
                        className="w-full text-left px-3 py-2 hover:bg-surface-hover transition-colors"
                        onClick={() => {
                          setBellOpen(false);
                          navigate(`/player/${item.id}`);
                        }}
                      >
                        <span className="block text-sm text-text truncate">{item.title}</span>
                        <span className="block text-xs text-text-muted truncate">
                          {item.channel_title}
                          {item.published_at ? ` · ${item.published_at.slice(0, 10)}` : ''}
                        </span>
                      </button>
                    </li>
                  ))}
                  {notifications && notifications.episodes.length === 0 && (
                    <li className="px-3 py-2 text-sm text-text-muted">Nothing new right now.</li>
                  )}
                </ul>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
