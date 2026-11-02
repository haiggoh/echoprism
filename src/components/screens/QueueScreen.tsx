import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { QueueItemComponent } from '../queue/QueueItem';
import { QueueEmptyState } from '../queue/QueueEmptyState';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { useToasts } from '../ui/Toaster';
import { useQueueStore } from '../../store/slices/queueSlice';
import { queueItemFromEpisode } from '../../hooks/useEpisodePlay';
import { playlistCommands, settingsCommands } from '../../hooks/useTauriCommands';
import { useNavigate } from 'react-router-dom';
import { usePlayerStore } from '../../store/slices/playerSlice';

export function QueueScreen() {
  const {
    items,
    currentIndex,
    isLoading,
    error,
    reorderItems,
    removeItem,
    setCurrentIndex,
    clearQueue,
    addItem,
    playNextItem,
    draggedEpisode,
    setDraggedEpisode,
  } = useQueueStore();
  // Display-only read of the ONE audio-only state; writes go through the
  // engine (AudioOnlyToggle), which re-resolves the stream.
  const isAudioMode = usePlayerStore((s) => s.isAudioMode);
  const navigate = useNavigate();
  const { addToast } = useToasts();
  const { data: preferences } = useQuery({
    queryKey: ['preferences'],
    queryFn: settingsCommands.get,
  });
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  // Phase 4: "Save as playlist" snapshots the live queue under a name.
  const [savingPlaylist, setSavingPlaylist] = useState(false);
  const [playlistName, setPlaylistName] = useState('');
  const savePlaylistMutation = useMutation({
    mutationFn: (name: string) =>
      playlistCommands.saveAsQueue(name, items.map((i) => i.episode_id)),
    onSuccess: () => {
      addToast({ title: 'Playlist saved', description: `${items.length} item${items.length === 1 ? '' : 's'} in “${playlistName.trim()}”`, variant: 'success' });
      setSavingPlaylist(false);
      setPlaylistName('');
    },
    onError: (err: unknown) =>
      addToast({
        title: 'Could not save playlist',
        description: err instanceof Error ? err.message : 'Unknown error',
        variant: 'danger',
      }),
  });
  // F05-H1 step 5 (replica/test-plan.md): clearing is destructive and
  // irreversible (local Zustand state) — it asks for confirmation first.
  const [confirmingClear, setConfirmingClear] = useState(false);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-semibold text-text">Queue</h1>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn-ghost btn-sm"
            onClick={() => setConfirmingClear(true)}
            disabled={items.length === 0}
          >
            Clear queue
          </button>
          <button
            className="btn-ghost btn-sm"
            disabled={items.length === 0}
            onClick={() => setSavingPlaylist(true)}
          >
            Save as playlist
          </button>
        </div>
      </div>

      <Modal
        isOpen={confirmingClear}
        onClose={() => setConfirmingClear(false)}
        variant="confirmation"
        size="sm"
        title="Clear queue?"
        description={`This removes ${items.length} ${items.length === 1 ? 'item' : 'items'} from your queue. This cannot be undone.`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmingClear(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={() => {
                clearQueue();
                setConfirmingClear(false);
              }}
            >
              Clear {items.length} {items.length === 1 ? 'episode' : 'episodes'}
            </Button>
          </>
        }
      >
        <p className="text-sm text-text-muted">
          Your queue is local to this app and is not recoverable after clearing.
        </p>
      </Modal>

      <Modal
        isOpen={savingPlaylist}
        onClose={() => setSavingPlaylist(false)}
        variant="form"
        size="sm"
        title="Save queue as playlist"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSavingPlaylist(false)}>
              Cancel
            </Button>
            <Button
              variant="unified"
              disabled={!playlistName.trim() || savePlaylistMutation.isPending}
              onClick={() => savePlaylistMutation.mutate(playlistName)}
            >
              Save
            </Button>
          </>
        }
      >
        <div>
          <label htmlFor="playlist-name" className="block text-sm font-medium mb-1">
            Playlist name
          </label>
          <input
            id="playlist-name"
            type="text"
            value={playlistName}
            onChange={(e) => setPlaylistName(e.target.value)}
            placeholder="e.g. Morning commute"
            className="w-full px-3 py-2 bg-surface border border-border rounded-md text-text placeholder-text-muted focus:border-input focus:outline-none focus:ring-2 focus:ring-focus-ring"
          />
          <p className="text-xs text-text-muted mt-1">
            Saves the current {items.length} queue item{items.length === 1 ? '' : 's'} in order.
          </p>
        </div>
      </Modal>

      {error && (
        <div className="px-4 py-2 bg-danger-soft text-danger text-sm">{error}</div>
      )}

      {/* Queue Content. F05: the whole pane is a drop zone for a feed episode
          being dragged over (works for the empty queue too); item-level drops
          still reorder and bubble up here only when no feed episode is set. */}
      <div
        className="flex-1 overflow-auto"
        data-testid="queue-drop-zone"
        onDragOver={(e) => {
          if (draggedEpisode) e.preventDefault();
        }}
        onDrop={(e) => {
          if (!draggedEpisode) return; // reorder drops are handled per item
          e.preventDefault();
          const ep = draggedEpisode;
          setDraggedEpisode(null);
          if (preferences?.queue_behavior === 'play_next') playNextItem(queueItemFromEpisode(ep));
          else addItem(queueItemFromEpisode(ep));
          addToast({ title: 'Queued', description: ep.title, variant: 'success' });
        }}
      >
        {items.length === 0 ? (
          isLoading ? (
            <div className="flex h-full items-center justify-center">
              <div className="convergence-loader" role="status" aria-label="Loading queue">
                <div className="convergence-loader-beams" />
                <div className="convergence-loader-prism" />
              </div>
            </div>
          ) : (
            <QueueEmptyState
              audioMode={isAudioMode}
              onAction={() => navigate('/feed')}
            />
          )
        ) : (
          <div className="p-4">
            <div className="space-y-2">
              {items.map((item, index) => (
                <QueueItemComponent
                  key={item.id}
                  item={item}
                  isPlaying={index === currentIndex}
                  isDragging={dragIndex === index}
                  onDragStart={() => setDragIndex(index)}
                  onDragEnd={() => setDragIndex(null)}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragIndex !== null && dragIndex !== index) {
                      reorderItems(dragIndex, index);
                    }
                    setDragIndex(null);
                  }}
                  onPlay={() => {
                    setCurrentIndex(index);
                    // Live-test 2026-10-28: clicking a queue row only moved the
                    // cursor, so from the Queue tab there was NO way back to the
                    // player you are listening to — the owner had to detour
                    // through History. This is the one surface used precisely to
                    // move between items, so a play here must open the player.
                    const ep = items[index]?.episode;
                    if (ep) navigate(`/player/${ep.id}`);
                  }}
                  onRemove={() => removeItem(item.id)}
                  onQueueAction={(action) => {
                    if (action === 'remove') removeItem(item.id);
                  }}
                />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Mini player area reserved */}
      <div className="h-[72px] lg:h-[80px]" />
    </div>
  );
}
