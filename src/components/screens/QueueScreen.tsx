import { useEffect } from 'react';
import { QueueItemComponent } from '../queue/QueueItem';
import { QueueEmptyState } from '../queue/QueueEmptyState';
import { useQueueStore } from '../../store/slices/queueSlice';
import { useUIStore } from '../../store/slices/uiSlice';
import { EmptyState } from '../ui/EmptyState';

export function QueueScreen() {
  const { items, currentIndex, isLoading, error, audioOnlyMode, setAudioOnlyMode } = useQueueStore();
  const { setViewMode } = useUIStore();

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
                checked={false}
                onChange={() => {}}
                className="w-4 h-4 accent-accent rounded border-border"
              />
              <span className="text-sm text-text-muted">Audio only</span>
            </label>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-ghost btn-sm" onClick={() => {}}>
            Clear queue
          </button>
          <button className="btn-ghost btn-sm" onClick={() => {}}>
            Save as playlist
          </button>
        </div>
      </div>

      {/* Queue Content */}
      <div className="flex-1 overflow-auto">
        {items.length === 0 ? (
          <QueueEmptyState 
            audioMode={false}
            onAction={() => setViewMode('feed')}
          />
        ) : (
          <div className="p-4">
            <div className="space-y-2">
              {/* Queue items would go here */}
              <div className="text-center py-12 text-text-muted">
                <p>Queue implementation in progress</p>
                <p className="text-sm mt-2">Queue items will appear here with drag-and-drop reordering</p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Mini player area reserved */}
      <div className="h-[72px] lg:h-[80px]" />
    </div>
  );
}
