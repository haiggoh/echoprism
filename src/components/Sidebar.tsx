import { Link, useLocation } from 'react-router-dom';
import { useUIStore } from '../store/slices/uiSlice';
import { useQueueStore } from '../store/slices/queueSlice';

const navItems = [
  { path: '/feed', label: 'Feed', icon: 'home' },
  { path: '/queue', label: 'Queue', icon: 'list' },
  { path: '/channels', label: 'Channels', icon: 'users' },
  { path: '/search', label: 'Search', icon: 'search' },
  { path: '/history', label: 'History', icon: 'clock' },
  { path: '/downloads', label: 'Downloads', icon: 'download' },
  { path: '/smart-links', label: 'Smart Links', icon: 'link' },
];

export function Sidebar() {
  const { sidebarOpen, sidebarCollapsed, setSidebarCollapsed } = useUIStore();
  const { audioOnlyMode, setAudioOnlyMode } = useQueueStore();
  // react-router Link + useLocation: a raw <a href> would do a full page
  // load on every navigation, resetting all in-memory state (the local-first
  // queue, the player). useLocation keeps the active-item highlight honest
  // across SPA navigations.
  const location = useLocation();

  if (!sidebarOpen && !sidebarCollapsed) return null;

  return (
    <aside
      className={`flex shrink-0 flex-col h-screen bg-bg-elevated border-r border-border transition-all duration-300 ease-in-out ${
        sidebarCollapsed ? 'w-16' : 'w-64'
      }`}
      aria-label="Main navigation"
    >
      {/* Logo */}
      <div className="flex items-center justify-between h-16 px-4 border-b border-border">
        {!sidebarCollapsed && (
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-stream-audio to-stream-video rounded-xl flex items-center justify-center">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5">
                <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                <path d="M2 17l10 5 10-5"></path>
                <path d="M2 12l10 5 10-5"></path>
              </svg>
            </div>
            <span className="font-semibold text-text">EchoPrism</span>
          </div>
        )}
        <button
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points={sidebarCollapsed ? "9 18 15 12 9 6" : "15 18 9 12 15 6"}></polyline>
          </svg>
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto p-2" role="navigation" aria-label="Main navigation">
        <ul className="space-y-1" role="list">
          {navItems.map((item) => (
            <li key={item.path}>
              <Link
                to={item.path}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                  location.pathname === item.path
                    ? 'bg-accent-soft text-accent'
                    : 'text-text-muted hover:text-text hover:bg-surface-hover'
                }`}
                aria-current={location.pathname === item.path ? 'page' : undefined}
              >
                <NavIcon name={item.icon} />
                {!sidebarCollapsed && <span className="font-medium">{item.label}</span>}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {/* Bottom section */}
      <div className="p-2 border-t border-border">
        <div className="flex items-center justify-between p-2 rounded-lg bg-surface">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-stream-audio to-stream-video rounded-xl flex items-center justify-center flex-shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5">
                <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
                <path d="M2 17l10 5 10-5"></path>
                <path d="M2 12l10 5 10-5"></path>
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-text truncate">EchoPrism</p>
              <p className="text-[10px] text-text-muted truncate">Two streams become one</p>
            </div>
          </div>
          <button className="p-1.5 rounded text-text-muted hover:text-text hover:bg-surface-hover transition-colors" aria-label="Settings">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 7.47"></path>
              <path d="M4.6 15a1.65 1.65 0 0 1-.33 7.47"></path>
              <path d="M21 12h-6"></path>
              <path d="M3 12h6"></path>
              <path d="M12 3v6"></path>
              <path d="M12 21v6"></path>
            </svg>
          </button>
        </div>

        {/* Audio mode toggle */}
        <label className="flex items-center justify-between p-2 rounded-lg bg-surface hover:bg-surface-hover cursor-pointer">
          <span className="text-sm text-text-muted">Audio only mode</span>
          <input
            type="checkbox"
            checked={audioOnlyMode}
            onChange={(e) => setAudioOnlyMode(e.target.checked)}
            className="w-4 h-4 accent-accent rounded border-border"
          />
        </label>
      </div>
  </aside>
  );
}

function NavIcon({ name }: { name: string }) {
  const icons: Record<string, React.ReactNode> = {
    home: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path><polyline points="9 22 9 12 15 12 15 22"></polyline></svg>,
    list: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="8" y1="6" x2="21" y2="6"></line><line x1="8" y1="12" x2="21" y2="12"></line><line x1="8" y1="18" x2="21" y2="18"></line><line x1="3" y1="6" x2="3.01" y2="18"></line></svg>,
    users: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>,
    search: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>,
    clock: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>,
    download: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>,
    link: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>,
  };
  
  return icons[name] || <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="10"></circle></svg>;
}
