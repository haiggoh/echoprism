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
              {filter.id === 'podcast' && <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7c0-2.21-1.79-4-4-4H2v2h2v10.55c0 3.87 3.13 7 7 7 1.1 0 2.1-.3 2.8-.86l2.14 2.14 1.41-1.41-2.14-2.14C17.25 12.81 18 10.79 18 8.5c0-2.76-2.24-5-5-5H5.53l3.53-3.53 1.41-1.41L1.82 2.22 3.23 3.64l3.53 3.53 1.41-1.41-3.53-3.53A9.01 9.01 0 0112 2c-4.97 0-9 4.03-9 9s4.03 9 9 9c4.6 0 8.51-3.48 8.84-8H12V3zm0 16c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6zm-1.5-9c0 .83-.67 1.5-1.5 1.5S12 13.83 12 13s.67 1.5 1.5 1.5S15 13.83 15 13s-.67-1.5-1.5-1.5z"></path>}</svg>}
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
