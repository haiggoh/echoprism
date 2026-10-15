import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { episodeCommands, channelCommands } from '../../hooks/useTauriCommands';
import { EpisodeCard } from '../feed/EpisodeCard';
import { ChannelCard } from '../feed/ChannelCard';
import { EmptyState } from '../ui/EmptyState';
import { useUIStore } from '../../store/slices/uiSlice';
import { FeedFilterTabs as FeedFilterTabsComponent } from '../feed/FeedFilterTabs';

export function FeedScreen() {
  const [filter, setFilter] = useState<'all' | 'video' | 'podcast' | 'queue'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const { setViewMode } = useUIStore();

  const { data: episodes, isLoading, error } = useQuery({
    queryKey: ['feed', filter],
    queryFn: () => episodeCommands.feed({ type: filter === 'all' ? undefined : filter }),
  });

  const { data: channels } = useQuery({
    queryKey: ['channels', filter],
    queryFn: () => channelCommands.list({ type: filter === 'all' ? undefined : filter }),
  });

  const handleFilterChange = (newFilter: 'all' | 'video' | 'podcast' | 'queue') => {
    setFilter(newFilter);
  };

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-8">
        <div className="text-center">
          <p className="text-text-muted mb-4">Failed to load feed</p>
          <button className="btn-unified" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      </div>
    );
  }

  if (isLoading && !episodes) {
    return (
      <div className="flex h-full items-center justify-center">
        <div className="convergence-loader" role="status" aria-label="Loading feed">
          <div className="convergence-loader-beams" />
          <div className="convergence-loader-prism" />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-4 border-b border-border">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-text">Feed</h1>
          <div className="flex items-center gap-2">
            <input
              type="search"
              placeholder="Search feed..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-64 px-3 py-2 bg-surface border border-border rounded-md text-text placeholder-text-muted focus:border-input focus:outline-none focus:ring-2 focus:ring-focus-ring"
            />
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <FeedFilterTabsComponent 
        activeFilter={filter} 
        onFilterChange={handleFilterChange} 
      />

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {episodes && episodes.length === 0 && (
          <EmptyState 
            variant="feed" 
            onAction={() => setViewMode('search')}
          />
        )}

        {episodes && episodes.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {episodes.map((episode) => (
              <EpisodeCard 
                key={episode.id} 
                episode={episode as any}
              />
            ))}
          </div>
        )}

        {/* Channels sidebar on desktop */}
        {channels && channels.length > 0 && (
          <div className="hidden lg:block mt-8">
            <h2 className="text-lg font-semibold text-text mb-4">Channels</h2>
            <div className="grid grid-cols-2 gap-4">
              {channels.slice(0, 6).map((channel) => (
                <ChannelCard key={channel.id} channel={channel as any} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
