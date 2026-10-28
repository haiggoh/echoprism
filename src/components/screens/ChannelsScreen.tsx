import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { channelCommands } from '../../hooks/useTauriCommands';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { Thumbnail } from '../ui/Thumbnail';

/**
 * 2c: was a static stub (permanent empty state, no query) while
 * channelCommands.list/unsubscribe were live. Now lists the subscriptions
 * with the loading/error/empty states every data screen needs.
 */
export function ChannelsScreen() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { data: channels, isLoading, isError, refetch } = useQuery({
    queryKey: ['channels', 'all'],
    queryFn: () => channelCommands.list(),
  });

  const unsubscribe = useMutation({
    mutationFn: (channelId: string) => channelCommands.unsubscribe(channelId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['channels'] }),
  });

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-4 border-b border-border flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text">Channels</h1>
        {channels && channels.length > 0 && (
          <span className="text-sm text-text-muted">
            {channels.length} channel{channels.length === 1 ? '' : 's'}
          </span>
        )}
      </div>
      <div className="flex-1 overflow-auto p-4" role="region" aria-label="Channels list" tabIndex={0}>
        {isLoading && <p className="text-text-muted">Loading channels…</p>}

        {isError && !isLoading && (
          <div className="text-center py-8">
            <p className="text-danger">Couldn't load channels.</p>
            <Button variant="ghost" className="mt-3" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        )}

        {!isLoading && !isError && channels && channels.length === 0 && (
          <EmptyState variant="channels" />
        )}

        {!isLoading && !isError && channels && channels.length > 0 && (
          <ul className="space-y-2" aria-label="Subscribed channels">
            {channels.map((channel) => (
              <li
                key={channel.id}
                data-testid="channel-row"
                className="flex items-center justify-between gap-4 bg-surface border border-border rounded-lg px-4 py-3"
              >
                {/* Live-test Task 10: a channel row is a way IN, not an inert
                    label. A real button (not a click handler on the <li>) so it
                    is keyboard-reachable and announced. Named distinctly from
                    the external home link beside it, which already reads
                    "Open <title> home". */}
                <button
                  type="button"
                  className="flex items-center gap-3 min-w-0 text-left rounded-lg"
                  aria-label={`Explore ${channel.title}`}
                  onClick={() => navigate(`/channels/${channel.id}`)}
                >
                  <Thumbnail
                    src={channel.thumbnail_url}
                    alt=""
                    className="w-10 h-10 rounded-full object-cover flex-shrink-0"
                  />
                  <span className="min-w-0">
                    <span className="block font-medium text-text truncate">{channel.title}</span>
                    <span className="block text-xs text-text-muted truncate mt-0.5">
                      {channel.format_preference}
                    </span>
                  </span>
                </button>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {channel.home_url && (
                    <a
                      href={channel.home_url}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open ${channel.title} home`}
                      className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                        <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                        <polyline points="15 3 21 3 21 9"></polyline>
                        <line x1="10" y1="14" x2="21" y2="3"></line>
                      </svg>
                    </a>
                  )}
                  <Button
                    variant="ghost"
                    aria-label={`Unsubscribe from ${channel.title}`}
                    disabled={unsubscribe.isPending}
                    onClick={() => unsubscribe.mutate(channel.id)}
                  >
                    Unsubscribe
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
