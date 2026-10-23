interface FeedFilterTabsProps {
  activeFilter: 'all' | 'video' | 'podcast' | 'queue';
  onFilterChange: (filter: 'all' | 'video' | 'podcast' | 'queue') => void;
}

export function FeedFilterTabs({ activeFilter, onFilterChange }: FeedFilterTabsProps) {
  const filters = [
    { id: 'all', label: 'All', count: null },
    { id: 'video', label: 'Video', count: null },
    { id: 'podcast', label: 'Podcasts', count: null },
    { id: 'queue', label: 'Queue', count: null },
  ] as const;

  return (
    <div className="border-b border-border px-4">
      <nav className="flex gap-1 overflow-x-auto pb-2" role="tablist" aria-label="Feed filters">
        {filters.map((filter) => (
          <button
            key={filter.id}
            role="tab"
            aria-selected={activeFilter === filter.id}
            onClick={() => onFilterChange(filter.id)}
            className={`px-4 py-2 text-sm font-medium rounded-lg whitespace-nowrap transition-colors ${
              activeFilter === filter.id
                ? 'bg-accent-soft text-accent border-b-2 border-accent'
                : 'text-text-muted hover:text-text hover:bg-surface-hover'
            }`}
          >
            <span className="flex items-center gap-1">
              {filter.id === 'all' && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>}
              {filter.id === 'video' && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><polygon points="23 7 16 12 23 17 23 7"></polygon></svg>}
              {/* Live-test pass: the old glyph was a garbled path nobody could
                  read. A podcast is headphones you subscribe with — the
                  Feather-style silhouette matches the icon family. */}
              {filter.id === 'podcast' && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 18v-6a9 9 0 0 1 18 0v6"></path><path d="M21 19a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3zM3 19a2 2 0 0 0 2 2h1a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"></path></svg>}
              {filter.label}
              {filter.count !== null && (
                <span className="ml-1 px-1.5 py-0.5 text-xs bg-surface rounded-full">{filter.count}</span>
              )}
            </span>
          </button>
        ))}
      </nav>
    </div>
  );
}
