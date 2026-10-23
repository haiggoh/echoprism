import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { episodeCommands } from '../../hooks/useTauriCommands';
import { useEpisodePlay } from '../../hooks/useEpisodePlay';
import { EpisodeCard } from '../feed/EpisodeCard';
import { FeedFilterTabs } from '../feed/FeedFilterTabs';
import { PodcastDirectorySection } from '../search/PodcastDirectorySection';
import { EmptyState } from '../ui/EmptyState';
import type { Episode } from '../../types';

export function SearchScreen() {
  // D6: search results are choice surfaces — cards are clickable with the
  // same D2 semantics as the feed (shared hook), so "the user's choice of an
  // episode IS the match signal" can actually happen here.
  const { handleCardClick, handleQueue } = useEpisodePlay();
  // Phase B: Retry invalidates the failed search query — the button was a
  // dead `onClick={() => {}}` relic from 2c, more visible since 2f made real
  // store errors reach this state.
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  // 2e: the term the directory (iTunes) is queried with — updated on SUBMIT
  // only, because iTunes is a rate-limited third party. The local FTS search
  // below keeps its per-keystroke behavior.
  const [submittedQuery, setSubmittedQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'video' | 'podcast' | 'queue'>('all');
  const [showResults, setShowResults] = useState(false);

  // Live-test pass: the Header's search box navigates here with ?q= —
  // prefill and run it, so the quick entry lands on real results.
  const [searchParams] = useSearchParams();
  useEffect(() => {
    const q = (searchParams.get('q') ?? '').trim();
    if (q.length >= 2) {
      setQuery(q);
      setSubmittedQuery(q);
      setShowResults(true);
    }
  }, [searchParams]);

  const { data: episodes, isLoading, error } = useQuery({
    queryKey: ['search', query, filter],
    queryFn: () => episodeCommands.search(query, { type: filter === 'all' ? undefined : filter }),
    enabled: showResults && query.length >= 2,
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim().length >= 2) {
      setShowResults(true);
      setSubmittedQuery(query.trim());
    }
  };

  return (
    <div className="h-full flex flex-col">
      {/* Search Header */}
      <div className="px-4 py-4 border-b border-border">
        <h1 className="text-2xl font-semibold text-text mb-3">Search</h1>
        <form onSubmit={handleSearch} className="flex gap-4">
          <div className="flex-1 relative">
            <input
              type="search"
              aria-label="Search videos, podcasts, channels"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search videos, podcasts, channels..."
              className="w-full px-4 py-3 bg-surface border border-border rounded-lg text-text placeholder-text-muted focus:border-input focus:outline-none focus:ring-2 focus:ring-focus-ring"
              autoFocus
            />
          </div>
          <button type="submit" className="btn-unified px-6" disabled={query.length < 2}>
            Search
          </button>
        </form>
      </div>

      {/* Filter Tabs */}
      <FeedFilterTabs 
        activeFilter={filter} 
        onFilterChange={setFilter} 
      />

      {/* Results */}
      <div className="flex-1 overflow-auto p-4">
        {!showResults && (
          <div className="flex h-full items-center justify-center">
            <div className="text-center p-8">
              <p className="text-text-muted text-lg">Enter a search query to find videos and podcasts</p>
              <p className="text-text-muted mt-2 text-sm">Minimum 2 characters</p>
            </div>
          </div>
        )}

        {showResults && isLoading && (
          <div className="flex h-64 items-center justify-center">
            <div className="convergence-loader" role="status">
              <div className="convergence-loader-beams" />
              <div className="convergence-loader-prism" />
            </div>
          </div>
        )}

        {showResults && !isLoading && error && (
          <div className="flex h-64 items-center justify-center">
            <div className="text-center p-8">
              <p className="text-danger mb-4">Search failed</p>
              <button
                className="btn-unified"
                onClick={() => queryClient.invalidateQueries({ queryKey: ['search'] })}
              >
                Retry
              </button>
            </div>
          </div>
        )}

        {showResults && !isLoading && !error && episodes && episodes.length === 0 && (
          <EmptyState 
            variant="search" 
            query={query}
          />
        )}

        {showResults && !isLoading && !error && episodes && episodes.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {episodes.map((episode) => (
              <EpisodeCard
                key={episode.id}
                episode={episode as Episode}
                onClick={() => handleCardClick(episode as Episode)}
                onQueue={(action) => handleQueue(action, episode as Episode)}
              />
            ))}
          </div>
        )}

        {/* 2e: the iTunes directory — 'all' and 'podcast' filters only, so the
            live-smoke criterion (podcast AND videos in one search) holds on
            the default tab and 'video'/'queue' cost no third-party query. */}
        {showResults && (filter === 'all' || filter === 'podcast') && (
          <PodcastDirectorySection query={submittedQuery} />
        )}
      </div>
    </div>
  );
}
