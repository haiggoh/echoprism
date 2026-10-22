import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { downloadCommands } from '../../hooks/useTauriCommands';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';

const STATUS_FILTERS = ['all', 'downloading', 'completed', 'failed'] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

const statusLabel: Record<StatusFilter, string> = {
  all: 'All',
  downloading: 'Downloading',
  completed: 'Completed',
  failed: 'Failed',
};

/**
 * 2c: was a static stub with a permanent empty state. Wired to
 * downloadCommands.list — and the filter now matches the command's actual
 * parameter (STATUS: the backend filters by status, not media type; the old
 * All/Video/Audio options could never have selected anything).
 */
export function DownloadsScreen() {
  const [status, setStatus] = useState<StatusFilter>('all');
  const queryClient = useQueryClient();

  const { data: downloads, isLoading, isError, refetch } = useQuery({
    queryKey: ['downloads', status],
    queryFn: () => downloadCommands.list(status),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['downloads'] });

  const cancelDownload = useMutation({
    mutationFn: (id: string) => downloadCommands.cancel(id),
    onSuccess: invalidate,
  });

  const deleteDownload = useMutation({
    mutationFn: (id: string) => downloadCommands.delete(id),
    onSuccess: invalidate,
  });

  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-4 border-b border-border flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text">Downloads</h1>
        <div className="flex gap-2">
          <select
            aria-label="Filter downloads"
            value={status}
            onChange={(e) => setStatus(e.target.value as StatusFilter)}
            className="px-3 py-1.5 bg-surface border border-border rounded-lg text-text"
          >
            {STATUS_FILTERS.map((s) => (
              <option key={s} value={s}>
                {statusLabel[s]}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-4" role="region" aria-label="Downloads list" tabIndex={0}>
        {isLoading && <p className="text-text-muted">Loading downloads…</p>}

        {isError && !isLoading && (
          <div className="text-center py-8">
            <p className="text-danger">Couldn't load downloads.</p>
            <Button variant="ghost" className="mt-3" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        )}

        {!isLoading && !isError && downloads && downloads.length === 0 && (
          <EmptyState variant="downloads" />
        )}

        {!isLoading && !isError && downloads && downloads.length > 0 && (
          <ul className="space-y-2" aria-label="Downloads">
            {downloads.map((download) => (
              <li
                key={download.id}
                data-testid="download-row"
                className="bg-surface border border-border rounded-lg px-4 py-3"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <p className="font-mono text-sm text-text truncate">{download.episode_id}</p>
                    <p className="text-xs text-text-muted mt-0.5">
                      {download.quality} · {download.format} · {download.status}
                      {download.progress > 0 && download.progress < 1
                        ? ` · ${Math.round(download.progress * 100)}%`
                        : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {download.status === 'downloading' && (
                      <Button
                        variant="ghost"
                        aria-label={`Cancel download of ${download.episode_id}`}
                        disabled={cancelDownload.isPending}
                        onClick={() => cancelDownload.mutate(download.id)}
                      >
                        Cancel
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      aria-label={`Delete download of ${download.episode_id}`}
                      disabled={deleteDownload.isPending}
                      onClick={() => deleteDownload.mutate(download.id)}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
                {download.status === 'downloading' && (
                  <div className="mt-2 h-1.5 bg-bg-elevated rounded-full overflow-hidden">
                    <div
                      className="h-full bg-accent"
                      style={{ width: `${Math.round(download.progress * 100)}%` }}
                    />
                  </div>
                )}
                {download.status === 'failed' && download.error_message && (
                  <p className="text-xs text-danger mt-2">{download.error_message}</p>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
