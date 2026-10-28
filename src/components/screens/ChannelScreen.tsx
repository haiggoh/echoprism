import { useQuery } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { episodeCommands } from '../../hooks/useTauriCommands';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { EpisodeCard } from '../feed/EpisodeCard';

/**
 * Live-test Task 10: "I'd like the channels liste there to be clickable to I
 * can explore them". The Channels list was inert — each channel an unclickable
 * row with no route behind it — so there was no way to see what a channel
 * contains.
 *
 * Reached by route (/channels/:channelId), which makes it linkable and
 * back-navigable rather than an in-place expansion of the list.
 *
 * The episode list reuses the existing feed command with a channelId filter —
 * the same key the Rust FeedParams already takes — rather than a second query
 * path that could drift from the feed.
 */
export function ChannelScreen() {
  const { channelId } = useParams<{ channelId: string }>();
  const navigate = useNavigate();

  const { data: episodes, isLoading, isError } = useQuery({
    queryKey: ['channel-episodes', channelId],
    queryFn: () => episodeCommands.feed({ channelId, limit: 200 }),
    enabled: !!channelId,
  });

  return (
    <div className="h-full flex flex-col" data-testid="channel-screen">
      <div className="px-4 py-4 border-b border-border flex items-center gap-3">
        <Button variant="ghost" onClick={() => navigate('/channels')}>
          ← Channels
        </Button>
        <h1 className="text-2xl font-semibold text-text truncate">Channel</h1>
        {episodes?.[0]?.channel && (
          <span className="text-sm text-text-muted truncate">{episodes[0].channel.title}</span>
        )}
      </div>

      <div className="flex-1 overflow-auto p-4">
        {isLoading && <p className="text-text-muted">Loading episodes…</p>}

        {isError && !isLoading && (
          <div className="text-center py-8">
            <p className="text-danger">Couldn&apos;t load this channel.</p>
          </div>
        )}

        {!isLoading && !isError && episodes && episodes.length === 0 && (
          <EmptyState variant="channels" />
        )}

        {!isLoading && !isError && episodes && episodes.length > 0 && (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Channel episodes">
            {episodes.map((episode) => (
              <li key={episode.id}>
                <EpisodeCard episode={episode} />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
