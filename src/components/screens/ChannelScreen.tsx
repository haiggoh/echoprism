import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useParams } from 'react-router-dom';
import { channelCommands, episodeCommands } from '../../hooks/useTauriCommands';
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
  const queryClient = useQueryClient();

  const { data: episodes, isLoading, isError } = useQuery({
    queryKey: ['channel-episodes', channelId],
    queryFn: () => episodeCommands.feed({ channelId, limit: 200 }),
    enabled: !!channelId,
  });

  // Live-test batch 2, Task 8: "subscriptions seem to be missing, there's no
  // obvious way to subscribe to a channel." This screen is where subscribing
  // now lives — reached by clicking the channel name while watching (PlayerScreen)
  // or a channel row (ChannelsScreen).
  //
  // subscribedOnly: false so an UNsubscribed channel is still found; the point is
  // to subscribe to one we do not follow yet.
  const { data: allChannels } = useQuery({
    queryKey: ['channels', 'all-channels'],
    queryFn: () => channelCommands.list({ subscribedOnly: false }),
    enabled: !!channelId,
  });
  const channel = allChannels?.find((c) => c.id === channelId);
  const subscribed = channel?.is_subscribed ?? false;

  // `subscribe` INSERTS a new channel row, which for a channel that already
  // exists would duplicate it and detach its episodes. Re-subscribing an
  // existing channel is the UPDATE, so the two paths are deliberately distinct.
  const subscribe = useMutation({
    mutationFn: (id: string) => channelCommands.resubscribe(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      queryClient.invalidateQueries({ queryKey: ['channel-episodes'] });
    },
  });
  const unsubscribe = useMutation({
    mutationFn: (id: string) => channelCommands.unsubscribe(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['channels'] });
      queryClient.invalidateQueries({ queryKey: ['channel-episodes'] });
    },
  });

  return (
    <div className="h-full flex flex-col" data-testid="channel-screen">
      <div className="px-4 py-4 border-b border-border flex items-center gap-3">
        <Button variant="ghost" onClick={() => navigate('/channels')}>
          ← Channels
        </Button>
        <h1 className="text-2xl font-semibold text-text truncate">
          {episodes?.[0]?.channel?.title ?? channel?.title ?? 'Channel'}
        </h1>
        {/* Live-test batch 2 Task 8: subscribe / unsubscribe belongs here, where
            the owner lands after clicking a channel name. */}
        {channel && (
          <Button
            variant="ghost"
            disabled={subscribe.isPending || unsubscribe.isPending}
            aria-label={
              subscribed
                ? `Unsubscribe from ${episodes?.[0]?.channel?.title ?? channel.title}`
                : 'Subscribe'
            }
            onClick={() => (subscribed ? unsubscribe.mutate(channel.id) : subscribe.mutate(channel.id))}
            className="ml-auto shrink-0"
          >
            {subscribed ? 'Unsubscribe' : 'Subscribe'}
          </Button>
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
