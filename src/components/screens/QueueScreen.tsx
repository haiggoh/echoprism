import { useState } from 'react';
import { QueueItemComponent } from '../queue/QueueItem';
import { QueueEmptyState } from '../queue/QueueEmptyState';
import { useQueueStore } from '../../store/slices/queueSlice';
import { useNavigate } from 'react-router-dom';

export function QueueScreen() {
  const {
    items,
    currentIndex,
    isLoading,
    error,
    audioOnlyMode,
    setAudioOnlyMode,
    reorderItems,
    removeItem,
    setCurrentIndex,
    clearQueue,
  } = useQueueStore();
  const navigate = useNavigate();
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="px-4 py-4 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-4">
          <h1 className="text-2xl font-semibold text-text">Queue</h1>
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={audioOnlyMode}
                onChange={(e) => setAudioOnlyMode(e.target.checked)}
                className="w-4 h-4 accent-accent rounded border-border"
              />
              <span className="text-sm text-text-muted">Audio only</span>
            </label>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-ghost btn-sm" onClick={() => clearQueue()}>
            Clear queue
          </button>
          <button className="btn-ghost btn-sm" onClick={() => {}}>
            Save as playlist
          </button>
        </div>
      </div>

      {error && (
        <div className="px-4 py-2 bg-danger-soft text-danger text-sm">{error}</div>
      )}

      {/* Queue Content */}
      <div className="flex-1 overflow-auto">
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
              audioMode={audioOnlyMode}
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
                  onPlay={() => setCurrentIndex(index)}
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
