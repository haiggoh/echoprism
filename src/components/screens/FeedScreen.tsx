import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { episodeCommands, channelCommands, settingsCommands } from '../../hooks/useTauriCommands';
import { usePlayer } from '../PlayerProvider';
import { EpisodeCard } from '../feed/EpisodeCard';
import { ChannelCard } from '../feed/ChannelCard';
import { EmptyState } from '../ui/EmptyState';
import { FeedFilterTabs as FeedFilterTabsComponent } from '../feed/FeedFilterTabs';
import { useQueueStore } from '../../store/slices/queueSlice';
import { useToasts } from '../ui/Toaster';
import type { Episode } from '../../types';

export function FeedScreen() {
  const navigate = useNavigate();
  const { addItem, playNextItem } = useQueueStore();
  const { play, isPlaying } = usePlayer();
  const { addToast } = useToasts();
  const { data: preferences } = useQuery({ queryKey: ['preferences'], queryFn: settingsCommands.get });
  const [filter, setFilter] = useState<'all' | 'video' | 'podcast' | 'queue'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const queueFromEpisode = (episode: Episode) => ({
    queue_id: 'local',
    episode_id: episode.id,
    added_at: new Date().toISOString(),
    source: 'feed' as const,
    play_mode: 'unified' as const,
    episode,
  });

  const handleQueue = (action: 'play_next' | 'add_end', episode: Episode) => {
    if (action === 'play_next') playNextItem(queueFromEpisode(episode));
    else addItem(queueFromEpisode(episode));
    addToast({
      title: action === 'play_next' ? 'Playing next' : 'Added to end of queue',
      variant: 'success',
    });
  };

  // D2 (design-decisions.md): clicking a card is configurable. 'auto' plays
  // now when nothing is playing and queues otherwise — never interrupting
  // current media. Queued items stream on demand (D1); nothing pre-downloads.
  const handleCardClick = (episode: Episode) => {
    const action = preferences?.card_click_action ?? 'auto';
    if (action === 'queue' || (action === 'auto' && isPlaying)) {
      handleQueue('add_end', episode);
      return;
    }
    if (action === 'load_paused') {
      navigate(`/player/${episode.id}`);
      return;
    }
    addItem(queueFromEpisode(episode));
    play(episode);
    navigate(`/player/${episode.id}`);
  };

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
            onAction={() => navigate('/search')}
          />
        )}

        {episodes && episodes.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {episodes.map((episode) => (
              <EpisodeCard
                key={episode.id}
                episode={episode}
                onClick={() => handleCardClick(episode)}
                onQueue={(action) => handleQueue(action, episode)}
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
