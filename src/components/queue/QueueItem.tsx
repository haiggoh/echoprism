import type { DragEvent } from 'react';
import { QueueItem, Episode, PlayMode } from '../../types';

interface QueueItemComponentProps {
  item: QueueItem & { episode?: Episode };
  isPlaying?: boolean;
  isDragging?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onDragOver?: (e: DragEvent) => void;
  onDrop?: (e: DragEvent) => void;
  onRemove?: () => void;
  onPlay?: () => void;
  onQueueAction?: (action: 'play_next' | 'add_end' | 'remove') => void;
  onModeChange?: (mode: PlayMode) => void;
}

export function QueueItemComponent({
  item,
  isPlaying = false,
  isDragging = false,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onRemove,
  onPlay,
  onQueueAction,
  onModeChange,
}: QueueItemComponentProps) {
  const formatTime = (seconds?: number) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const episode = item.episode;
  const playMode: PlayMode = item.play_mode;

  const playModeLabels: Record<PlayMode, string> = {
    video: 'Video',
    audio: 'Audio',
    unified: 'Unified',
  };

  return (
    <article
      className={`group flex items-center gap-3 p-3 rounded-lg transition-all duration-200 ${
        isPlaying ? 'bg-accent-soft border-l-4 border-accent' : 'bg-surface border border-border hover:border-border-strong'
      } ${isDragging ? 'opacity-80 shadow-lg rotate-1' : ''}`}
      draggable={true}
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        onDragStart?.();
      }}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onClick={onPlay}
      onKeyDown={(e) => { if (e.key === 'Enter' && onPlay) onPlay(); }}
      tabIndex={0}
      role="button"
      aria-label={episode ? `Play ${episode.title}` : 'Queue item'}
    >
      {/* Drag handle */}
      <button
        className="p-1 text-text-muted hover:text-text hover:bg-surface-hover rounded transition-colors cursor-grab"
        aria-label="Drag to reorder"
        onMouseDown={(e) => { e.stopPropagation(); }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="9" cy="6" r="1.5"></circle>
          <circle cx="9" cy="12" r="1.5"></circle>
          <circle cx="9" cy="18" r="1.5"></circle>
          <circle cx="15" cy="6" r="1.5"></circle>
          <circle cx="15" cy="12" r="1.5"></circle>
          <circle cx="15" cy="18" r="1.5"></circle>
        </svg>
      </button>

      {/* Thumbnail */}
      <div className="relative w-16 h-9 flex-shrink-0 rounded-md overflow-hidden bg-bg-elevated">
        {episode?.thumbnail_url && (
          <img
            src={episode.thumbnail_url}
            alt=""
            className="w-full h-full object-cover"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
        )}
        {episode?.duration_seconds && (
          <div className="absolute bottom-1 right-1 bg-black/80 text-white text-xs px-1 py-0.5 rounded">
            {formatTime(episode.duration_seconds)}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <h4 className="font-medium text-text truncate">{episode?.title ?? 'Unknown episode'}</h4>
        <p className="text-sm text-text-muted truncate">{episode?.channel?.title ?? 'Unknown channel'}</p>
        <div className="flex items-center gap-2 mt-1">
          <button
            className="px-1.5 py-0.5 text-xs font-medium bg-accent-soft text-accent rounded-full hover:bg-accent hover:text-text-inverse transition-colors"
            aria-label={`Switch play mode (currently ${playModeLabels[playMode]})`}
            onClick={(e) => {
              e.stopPropagation();
              const next: PlayMode = playMode === 'video' ? 'audio' : playMode === 'audio' ? 'unified' : 'video';
              onModeChange?.(next);
            }}
          >
            {playModeLabels[playMode]}
          </button>
          {item.smart_link_id && (
            <span className="px-1.5 py-0.5 text-xs font-medium bg-accent-soft text-accent rounded-full flex items-center gap-1">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
              </svg>
              Link
            </span>
          )}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        <button
          className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
          aria-label="Play next"
          onClick={(e) => { e.stopPropagation(); onQueueAction?.('play_next'); }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
            <line x1="19" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>
        <button
          className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
          aria-label="Add to end"
          onClick={(e) => { e.stopPropagation(); onQueueAction?.('add_end'); }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>
        <button
          className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-danger-soft transition-colors"
          aria-label="Remove from queue"
          onClick={(e) => { e.stopPropagation(); onRemove?.(); }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    </article>
  );
}
