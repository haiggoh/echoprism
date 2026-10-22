import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { channelCommands, episodeCommands, podcastCommands } from '../../hooks/useTauriCommands';
import { useEpisodePlay } from '../../hooks/useEpisodePlay';
import { useToasts } from '../ui/Toaster';
import { Thumbnail } from '../ui/Thumbnail';
import type { Episode, PodcastSearchResult } from '../../types';

/**
 * 2e: the iTunes podcast directory on the Search screen — the 1c backend
 * (search_podcasts / subscribe_podcast) was registered but unreachable from
 * the UI. Rendered by SearchScreen on the 'all' and 'podcast' filters so the
 * live-smoke criterion (podcast AND videos in ONE search) holds on the
 * default tab; hidden on 'video'/'queue' so those filters cost no iTunes
 * query.
 *
 * The query here is the SUBMITTED term: iTunes is a rate-limited third
 * party, so unlike the local FTS search this does not re-fire per keystroke.
 * Subscribe state derives from the channels list (cross-session honest) plus
 * this session's subscriptions; a successful subscribe lists that feed's
 * episodes inline (get_feed channelId), each row on the shared D2/D6/D7
 * card-click chain.
 */
export function PodcastDirectorySection({ query }: { query: string }) {
  const { handleCardClick } = useEpisodePlay();
  const { addToast } = useToasts();
  const queryClient = useQueryClient();
  // feed_url -> channel_id for THIS session's subscriptions; older ones come
  // from the channels query below (subscribing persists a podcast channel).
  const [subscriptions, setSubscriptions] = useState<Record<string, string>>({});
  // The feed whose episodes are listed inline — the one just subscribed.
  const [expandedChannelId, setExpandedChannelId] = useState<string | null>(null);

  const enabled = query.trim().length >= 2;
  const { data: results, isLoading, isError } = useQuery({
    queryKey: ['podcast-directory', query],
    queryFn: () => podcastCommands.search(query),
    enabled,
  });

  const { data: channels } = useQuery({
    queryKey: ['channels', 'podcast-directory'],
    queryFn: () => channelCommands.list(),
    enabled,
  });

  const subscribe = useMutation({
    mutationFn: (result: PodcastSearchResult) =>
      podcastCommands.subscribe(result.feed_url, result.title),
    onSuccess: (sub, result) => {
      setSubscriptions((prev) => ({ ...prev, [result.feed_url]: sub.channel_id }));
      setExpandedChannelId(sub.channel_id);
      addToast({
        title: `Subscribed to ${sub.title}`,
        description: `${sub.new_episodes} new episode${sub.new_episodes === 1 ? '' : 's'}`,
        variant: 'success',
      });
      // Subscribed episodes are now rows in the local DB — search must see them.
      queryClient.invalidateQueries({ queryKey: ['search'] });
    },
    onError: (err: unknown) => {
      addToast({
        title: 'Subscribe failed',
        description: err instanceof Error ? err.message : String(err),
        variant: 'danger',
      });
    },
  });

  const { data: feedEpisodes } = useQuery({
    queryKey: ['podcast-feed-episodes', expandedChannelId],
    queryFn: () => episodeCommands.feed({ channelId: expandedChannelId as string }),
    enabled: expandedChannelId !== null,
  });

  if (!enabled || isLoading || isError) {
    if (isLoading) {
      return (
        <section aria-labelledby="podcast-directory-heading" className="mt-6">
          <h2 id="podcast-directory-heading" className="text-lg font-semibold text-text mb-3">
            Podcast directory
          </h2>
          <div className="convergence-loader" role="status" aria-label="Searching podcast directory">
            <div className="convergence-loader-beams" />
            <div className="convergence-loader-prism" />
          </div>
        </section>
      );
    }
    return null;
  }

  if (!results || results.length === 0) return null;

  return (
    <section aria-labelledby="podcast-directory-heading" className="mt-6">
      <h2 id="podcast-directory-heading" className="text-lg font-semibold text-text mb-3">
        Podcast directory
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {results.map((result) => {
          const channelId =
            subscriptions[result.feed_url] ??
            channels?.find((c) => c.podcast_feed_url === result.feed_url)?.id;
          const expanded = channelId !== undefined && channelId === expandedChannelId;
          return (
            <article
              key={result.feed_url}
              className="bg-surface border border-border rounded-lg overflow-hidden flex flex-col"
            >
              <Thumbnail src={result.artwork} alt="" className="w-full aspect-square object-cover" loading="lazy" />
              <div className="p-3 flex flex-col gap-1 flex-1">
                <h3 className="text-text font-medium line-clamp-2">{result.title}</h3>
                {result.author && <p className="text-text-muted text-sm">{result.author}</p>}
                {result.genres.length > 0 && (
                  <p className="text-text-muted text-xs">{result.genres.slice(0, 3).join(' · ')}</p>
                )}
                {channelId === undefined ? (
                  <button
                    type="button"
                    className="btn-unified mt-2"
                    disabled={subscribe.isPending}
                    aria-label={`Subscribe to ${result.title}`}
                    onClick={() => subscribe.mutate(result)}
                  >
                    Subscribe
                  </button>
                ) : (
                  <button
                    type="button"
                    className="btn-unified mt-2"
                    disabled
                    aria-label={`Subscribed to ${result.title}`}
                  >
                    Subscribed ✓
                  </button>
                )}
              </div>
              {expanded && feedEpisodes && feedEpisodes.length > 0 && (
                <ul className="border-t border-border" aria-label={`${result.title} episodes`}>
                  {feedEpisodes.map((episode: Episode) => (
                    <li key={episode.id}>
                      <button
                        type="button"
                        data-testid="directory-episode-row"
                        className="w-full text-left px-3 py-2 hover:bg-surface-hover transition-colors"
                        onClick={() => handleCardClick(episode)}
                      >
                        <span className="block text-sm text-text line-clamp-1">{episode.title}</span>
                        <span className="block text-xs text-text-muted">
                          {episode.duration_seconds
                            ? `${Math.round(episode.duration_seconds / 60)} min`
                            : ''}
                          {episode.published_at ? ` · ${episode.published_at.slice(0, 10)}` : ''}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          );
        })}
      </div>
    </section>
  );
}
