import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { playlistCommands } from '../../hooks/useTauriCommands';
import { queueItemFromEpisode } from '../../hooks/useEpisodePlay';
import { useQueueStore } from '../../store/slices/queueSlice';
import { usePlayer } from '../PlayerProvider';
import { useToasts } from '../ui/Toaster';
import { Button } from '../ui/Button';
import { EmptyState } from '../ui/EmptyState';
import { Modal } from '../ui/Modal';

/**
 * Playlists (dead-controls plan Phase 4): named, ordered snapshots of a
 * queue. "Save as playlist" lives on the Queue screen; this screen lists
 * playlists and can replay one — Play fills the queue in playlist order and
 * starts the first item (the queue is client-side, so the Rust command
 * returns the ordered episodes and the store is filled here).
 *
 * Loading/error/empty states follow the 2c discipline every data screen has.
 */
export function PlaylistsScreen() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { addToast } = useToasts();
  const setItems = useQueueStore((s) => s.setItems);
  const setCurrentIndex = useQueueStore((s) => s.setCurrentIndex);
  const { play } = usePlayer();

  const { data: playlists, isLoading, isError, refetch } = useQuery({
    queryKey: ['playlists'],
    queryFn: () => playlistCommands.list(),
  });

  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['playlists'] });
    queryClient.invalidateQueries({ queryKey: ['playlist-items'] });
  };
  const onError = (err: unknown) =>
    addToast({
      title: 'Playlist action failed',
      description: err instanceof Error ? err.message : 'Unknown error',
      variant: 'danger',
    });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => playlistCommands.remove(id),
    onSuccess: () => {
      invalidate();
      setConfirmDelete(null);
    },
    onError,
  });
  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => playlistCommands.rename(id, name),
    onSuccess: () => {
      invalidate();
      setRenaming(null);
    },
    onError,
  });
  const removeItemMutation = useMutation({
    mutationFn: (itemId: string) => playlistCommands.removeItem(itemId),
    onSuccess: invalidate,
    onError,
  });
  const playMutation = useMutation({
    mutationFn: (id: string) => playlistCommands.play(id),
    onSuccess: (episodes) => {
      setItems(
        episodes.map((ep, i) => ({ ...queueItemFromEpisode(ep), id: crypto.randomUUID(), position: i })),
      );
      setCurrentIndex(0);
      if (episodes[0]) {
        play(episodes[0]);
        navigate(`/player/${episodes[0].id}`);
      }
      addToast({
        title: 'Playing playlist',
        description: `${episodes.length} item${episodes.length === 1 ? '' : 's'} queued in order`,
        variant: 'success',
      });
    },
    onError,
  });

  return (
    <div className="h-full overflow-auto p-4">
      <div className="flex flex-col gap-4">
        <h1 className="text-2xl font-semibold text-text">Playlists</h1>

        {isLoading && <p className="text-text-muted">Loading playlists…</p>}

        {isError && !isLoading && (
          <div className="text-center py-8">
            <p className="text-danger">Couldn&apos;t load playlists.</p>
            <Button variant="ghost" className="mt-3" onClick={() => refetch()}>
              Retry
            </Button>
          </div>
        )}

        {!isLoading && !isError && playlists && playlists.length === 0 && <EmptyState variant="queue" />}

        {!isLoading && !isError && playlists && playlists.length > 0 && (
          <ul className="space-y-2" aria-label="Playlists">
            {playlists.map((pl) => (
              <li
                key={pl.id}
                data-testid="playlist-row"
                className="bg-surface border border-border rounded-lg px-4 py-3"
              >
                <div className="flex items-center justify-between gap-4">
                  <button
                    type="button"
                    className="min-w-0 text-left"
                    aria-expanded={expanded === pl.id}
                    onClick={() => setExpanded(expanded === pl.id ? null : pl.id)}
                  >
                    <span className="text-sm font-medium text-text truncate block">{pl.name}</span>
                  </button>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="unified"
                      aria-label={`Play playlist ${pl.name}`}
                      disabled={playMutation.isPending}
                      onClick={() => playMutation.mutate(pl.id)}
                    >
                      Play
                    </Button>
                    <Button variant="ghost" aria-label={`Rename playlist ${pl.name}`} onClick={() => setRenaming({ id: pl.id, name: pl.name })}>
                      Rename
                    </Button>
                    <Button variant="ghost" aria-label={`Delete playlist ${pl.name}`} onClick={() => setConfirmDelete(pl.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
                {expanded === pl.id && <PlaylistItems playlistId={pl.id} onRemoveItem={(itemId) => removeItemMutation.mutate(itemId)} />}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Modal
        isOpen={renaming !== null}
        onClose={() => setRenaming(null)}
        variant="form"
        size="sm"
        title="Rename playlist"
        footer={
          renaming && (
            <>
              <Button variant="ghost" onClick={() => setRenaming(null)}>
                Cancel
              </Button>
              <Button
                variant="unified"
                disabled={!renaming.name.trim() || renameMutation.isPending}
                onClick={() => renameMutation.mutate({ id: renaming.id, name: renaming.name })}
              >
                Save
              </Button>
            </>
          )
        }
      >
        {renaming && (
          <div>
            <label htmlFor="rename-playlist-name" className="block text-sm font-medium mb-1">
              Name
            </label>
            <input
              id="rename-playlist-name"
              type="text"
              value={renaming.name}
              onChange={(e) => setRenaming({ ...renaming, name: e.target.value })}
              className="w-full px-3 py-2 bg-surface border border-border rounded-md text-text focus:border-input focus:outline-none focus:ring-2 focus:ring-focus-ring"
            />
          </div>
        )}
      </Modal>

      <Modal
        isOpen={confirmDelete !== null}
        onClose={() => setConfirmDelete(null)}
        variant="confirmation"
        size="sm"
        title="Delete playlist?"
        description="This removes the playlist and its items. This cannot be undone."
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmDelete(null)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={deleteMutation.isPending}
              onClick={() => confirmDelete && deleteMutation.mutate(confirmDelete)}
            >
              Delete
            </Button>
          </>
        }
      >
        <p className="text-sm text-text-muted">
          The playlist and all its items are removed; episodes already downloaded or in the queue are untouched.
        </p>
      </Modal>
    </div>
  );
}

function PlaylistItems({
  playlistId,
  onRemoveItem,
}: {
  playlistId: string;
  onRemoveItem: (itemId: string) => void;
}) {
  const { data: items, isLoading } = useQuery({
    queryKey: ['playlist-items', playlistId],
    queryFn: () => playlistCommands.items(playlistId),
  });

  if (isLoading) return <p className="text-sm text-text-muted mt-2">Loading items…</p>;
  if (!items || items.length === 0) return <p className="text-sm text-text-muted mt-2">Empty playlist.</p>;

  return (
    <ul className="mt-2 space-y-1" aria-label="Playlist items">
      {items.map((item) => (
        <li key={item.id} data-testid="playlist-item-row" className="flex items-center justify-between gap-3 text-sm">
          <span className="truncate text-text">{item.episode_title ?? item.episode_id}</span>
          <button
            type="button"
            aria-label={`Remove ${item.episode_title ?? item.episode_id} from playlist`}
            className="text-xs text-text-muted hover:text-text shrink-0"
            onClick={() => onRemoveItem(item.id)}
          >
            Remove
          </button>
        </li>
      ))}
    </ul>
  );
}
