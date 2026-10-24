import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { historyCommands } from '../../hooks/useTauriCommands';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { Thumbnail } from '../ui/Thumbnail';

/**
 * 2c: was a static stub while historyCommands.list/clear were live. Lists
 * playback history with loading/error/empty states and a clear action.
 */
export function HistoryScreen() {
  const queryClient = useQueryClient();
  const { data: history, isLoading, isError, refetch } = useQuery({
    queryKey: ['history'],
    queryFn: () => historyCommands.list(),
  });

  const clearHistory = useMutation({
    mutationFn: () => historyCommands.clear(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['history'] }),
  });

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
  };

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-4 border-b border-border flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text">History</h1>
        {history && history.length > 0 && (
          <Button
            variant="ghost"
            disabled={clearHistory.isPending}
            onClick={() => clearHistory.mutate()}
          >
            Clear history
          </Button>
        )}
      </div>
      <div className="flex-1 overflow-auto p-4" role="region" aria-label="History list" tabIndex={0}>
        {isLoading && <p className="text-text-muted">Loading history…</p>}

        {isError && !isLoading && (
          <div className="text-center py-8">
            <p className="text-danger">Couldn't load history.</p>
            <Button variant="ghost" className="mt-3" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        )}

        {!isLoading && !isError && history && history.length === 0 && (
          <EmptyState variant="history" />
        )}

        {!isLoading && !isError && history && history.length > 0 && (
          <ul className="space-y-2" aria-label="Playback history">
            {history.map((entry) => (
              <li
                key={entry.id}
                data-testid="history-row"
                className="flex items-center justify-between gap-4 bg-surface border border-border rounded-lg px-4 py-3"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Thumbnail
                    src={entry.episode_thumbnail}
                    alt=""
                    className="w-10 h-10 rounded-md object-cover flex-shrink-0"
                  />
                  <div className="min-w-0">
                    {/* A usable history names the media: the hydrated title
                        links back to the player; a deleted episode renders
                        its id, honestly untitled. */}
                    {entry.episode_title ? (
                      <Link
                        to={`/player/${entry.episode_id}`}
                        className="text-sm text-text truncate hover:text-accent"
                      >
                        {entry.episode_title}
                      </Link>
                    ) : (
                      <p className="font-mono text-sm text-text-muted truncate">{entry.episode_id}</p>
                    )}
                    <p className="text-xs text-text-muted mt-0.5">
                      {formatDate(entry.played_at)} · {Math.floor(entry.position_seconds / 60)}m
                      {entry.completed ? ' · finished' : ''}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
