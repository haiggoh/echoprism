import { forwardRef } from 'react';
import { clsx } from 'clsx';
import { Play, Volume2, Video, Link2, GripVertical, X, MoreHorizontal } from 'lucide-react';
import { Thumbnail } from './Thumbnail';

export interface QueueItemProps {
  variant?: 'video' | 'audio' | 'smart-link';
  size?: 'default' | 'compact';
  title: string;
  channelTitle: string;
  thumbnailUrl?: string;
  duration?: number;
  position: number;
  isPlaying?: boolean;
  isDragging?: boolean;
  isDropTarget?: boolean;
  smartLink?: {
    confidence: number;
    matched: boolean;
  } | null;
  onPlay?: () => void;
  onRemove?: () => void;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  onDragEnd?: () => void;
  onMore?: () => void;
  className?: string;
}

const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

export const QueueItem = forwardRef<HTMLDivElement, QueueItemProps>(
  ({
    variant = 'video',
    size = 'default',
    title,
    channelTitle,
    thumbnailUrl,
    duration,
    position,
    isPlaying = false,
    isDragging = false,
    isDropTarget = false,
    smartLink = null,
    onPlay,
    onRemove,
    onDragStart,
    onDragOver,
    onDrop,
    onDragEnd,
    onMore,
    className = '',
  }, ref) => {
    const sizeStyles = {
      default: 'h-16',
      compact: 'h-12',
    };

    const textSizes = {
      default: 'text-sm',
      compact: 'text-xs',
    };

    const getFormatColor = () => {
      switch (variant) {
        case 'audio': return 'border-audio';
        case 'video': return 'border-video';
        default: return 'border-accent';
      }
    };

    // const getFormatIcon = () => {
//   switch (variant) {
//     case 'audio': return <Volume2 className="w-4 h-4" aria-hidden="true" />;
//     case 'video': return <Video className="w-4 h-4" aria-hidden="true" />;
//     default: return <Link2 className="w-4 h-4" aria-hidden="true" />;
//   }
// }; // Reserved for future use in variant badges

    return (
      <div
        ref={ref}
        draggable={!isPlaying}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onDragEnd={onDragEnd}
        className={clsx(
          'group relative flex items-center gap-3 px-3',
          'bg-surface border-l-4 transition-all duration-200',
          isPlaying && 'bg-accent-soft border-accent',
          !isPlaying && `border-${getFormatColor()}`,
          isDragging && 'opacity-50 rotate-1 shadow-pop z-10',
          isDropTarget && 'border-accent bg-accent-soft/50',
          sizeStyles[size],
          className
        )}
        role="listitem"
        aria-label={`Queue position ${position}: ${title}`}
      >
        {/* Drag handle */}
        <button
          type="button"
          className="p-1 rounded flex-shrink-0 text-text-muted hover:text-accent transition-colors opacity-0 group-hover:opacity-100"
          onMouseDown={(e) => e.stopPropagation()}
          aria-label="Drag to reorder"
          tabIndex={-1}
        >
          <GripVertical className="w-5 h-5" aria-hidden="true" />
        </button>

        {/* Position number / Playing indicator */}
        <div className="flex-shrink-0 w-8 text-center">
          {isPlaying ? (
            <div className="flex items-center justify-center">
              <div className="flex gap-1">
                <span className="w-1.5 h-4 bg-accent animate-[equalizer_1s_ease-in-out_infinite]" style={{animationDelay: '0ms'}} aria-hidden="true" />
                <span className="w-1.5 h-4 bg-accent animate-[equalizer_1s_ease-in-out_infinite]" style={{animationDelay: '150ms'}} aria-hidden="true" />
                <span className="w-1.5 h-4 bg-accent animate-[equalizer_1s_ease-in_out_infinite]" style={{animationDelay: '300ms'}} aria-hidden="true" />
              </div>
            </div>
          ) : (
            <span className={clsx('font-mono font-medium', textSizes[size], isPlaying ? 'text-accent' : 'text-text-muted')}>
              {position}
            </span>
          )}
        </div>

        {/* Thumbnail */}
        <div className="relative flex-shrink-0 overflow-hidden rounded">
          {thumbnailUrl ? (
            <Thumbnail
              src={thumbnailUrl}
              alt=""
              className={clsx('w-full h-full object-cover', size === 'default' ? 'w-12 h-12' : 'w-8 h-8')}
              loading="lazy"
            />
          ) : (
            <div className={clsx('w-full h-full bg-surface-hover flex items-center justify-center', size === 'default' ? 'w-12 h-12' : 'w-8 h-8')}>
              {variant === 'audio' ? (
                <Volume2 className={clsx('text-text-muted', size === 'default' ? 'w-6 h-6' : 'w-4 h-4')} aria-hidden="true" />
              ) : (
                <Video className={clsx('text-text-muted', size === 'default' ? 'w-6 h-6' : 'w-4 h-4')} aria-hidden="true" />
              )}
            </div>
          )}

          {/* Smart Link indicator on thumbnail */}
          {smartLink && (
            <span className="absolute bottom-0 right-0 -translate-y-1/2 -translate-x-1/2 inline-flex items-center gap-0.5 px-1.5 py-0.5 text-xs font-medium rounded-full bg-accent-soft text-accent border border-accent">
              <Link2 className="w-2.5 h-2.5" aria-hidden="true" />
              <span>{Math.round(smartLink.confidence * 100)}%</span>
            </span>
          )}
        </div>

        {/* Title & Channel */}
        <div className="flex-1 min-w-0 flex flex-col justify-center gap-0.5">
          <h4 className={clsx('font-medium truncate', textSizes[size])}>
            {title}
          </h4>
          <div className="flex items-center gap-2 text-text-muted">
            <span className={clsx('truncate', textSizes[size])}>{channelTitle}</span>
            {duration && (
              <span className={clsx('font-mono', textSizes[size])}>
                {formatDuration(duration)}
              </span>
            )}
          </div>
        </div>

        {/* Smart Link badge */}
        {smartLink && (
          <button
            type="button"
            onClick={() => {}}
            className="flex-shrink-0 inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-accent-soft text-accent border border-accent transition-all duration-200 hover:shadow-[0_0_8px_var(--accent)]"
            aria-label={smartLink.matched ? `Switch to ${variant === 'video' ? 'audio' : 'video'} version` : 'Smart link available'}
          >
            <Link2 className="w-3 h-3" aria-hidden="true" />
            <span>{Math.round(smartLink.confidence * 100)}%</span>
          </button>
        )}

        {/* Actions */}
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
          {onPlay && !isPlaying && (
            <button
              type="button"
              onClick={onPlay}
              className="p-1.5 rounded-full bg-surface-hover text-text-muted hover:bg-accent-soft hover:text-accent transition-colors"
              aria-label="Play now"
            >
              <Play className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
          {onMore && (
            <button
              type="button"
              onClick={onMore}
              className="p-1.5 rounded-full bg-surface-hover text-text-muted hover:bg-accent-soft hover:text-accent transition-colors"
              aria-label="More options"
            >
              <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              onClick={onRemove}
              className="p-1.5 rounded-full bg-surface-hover text-text-muted hover:bg-danger-soft hover:text-danger transition-colors"
              aria-label="Remove from queue"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
        </div>
      </div>
    );
  }
);

QueueItem.displayName = 'QueueItem';