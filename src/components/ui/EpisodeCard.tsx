import { forwardRef, useState } from 'react';
import { clsx } from 'clsx';
import { Play, Volume2, Video, Link2, Download, Clock } from 'lucide-react';

export interface EpisodeCardProps {
  variant?: 'video' | 'audio' | 'smart-link';
  size?: 'feed' | 'compact' | 'expanded';
  title: string;
  channelTitle: string;
  channelHandle?: string;
  thumbnailUrl?: string;
  duration?: number; // seconds
  publishedAt?: string;
  isPlaying?: boolean;
  isQueued?: boolean;
  isDownloaded?: boolean;
  smartLink?: {
    confidence: number;
    matched: boolean;
  } | null;
  // onPlay?: () => void; // Reserved for future use
  onQueue?: () => void;
  onDownload?: () => void;
  onSmartLinkClick?: () => void;
  className?: string;
}

const formatDuration = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

const formatDate = (dateString: string): string => {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));

  if (diffDays > 365) return `${Math.floor(diffDays / 365)}y ago`;
  if (diffDays > 30) return `${Math.floor(diffDays / 30)}mo ago`;
  if (diffDays > 0) return `${diffDays}d ago`;
  if (diffHours > 0) return `${diffHours}h ago`;
  return 'Just now';
};

export const EpisodeCard = forwardRef<HTMLDivElement, EpisodeCardProps>(
  ({
    variant = 'video',
    size = 'feed',
    title,
    channelTitle,
    channelHandle,
    thumbnailUrl,
    duration,
    publishedAt,
    isPlaying = false,
    isQueued = false,
    isDownloaded = false,
    smartLink = null,
    onQueue,
    onDownload,
    onSmartLinkClick,
    className = '',
  }, ref) => {
    const sizeStyles = {
      feed: 'w-full max-w-sm',
      compact: 'w-full',
      expanded: 'w-full max-w-2xl',
    };

    // 2c: a thumbnail URL that exists but 404s must reach this card's own
    // variant-aware fallback (the audio Volume2 glyph), not a broken-image
    // icon. Load failure is state, not just absence.
    const [imgFailed, setImgFailed] = useState(false);

    const thumbnailStyles = {
      feed: 'aspect-video',
      compact: 'aspect-video w-24 h-24 flex-shrink-0',
      expanded: 'aspect-video',
    };

    const textSizes = {
      feed: 'text-base',
      compact: 'text-sm',
      expanded: 'text-lg',
    };

    return (
      <article
        ref={ref}
        className={clsx(
          'group relative flex flex-col bg-surface border border-border rounded-md overflow-hidden transition-all duration-200',
          'hover:border-border-input hover:shadow-card',
          isPlaying && 'border-accent bg-accent-soft',
          isQueued && 'border-video/50',
          sizeStyles[size],
          className
        )}
      >
        <div className="relative overflow-hidden">
          <div className={clsx(thumbnailStyles[size])}>
            {thumbnailUrl && !imgFailed ? (
              <img
                src={thumbnailUrl}
                alt=""
                className={clsx(
                  'w-full h-full object-cover transition-transform duration-300',
                  'group-hover:scale-105'
                )}
                loading="lazy"
                onError={() => setImgFailed(true)}
              />
            ) : (
              <div className="w-full h-full bg-surface-hover flex items-center justify-center">
                {variant === 'audio' ? (
                  <Volume2 className="w-12 h-12 text-text-muted" aria-hidden="true" />
                ) : (
                  <Video className="w-12 h-12 text-text-muted" aria-hidden="true" />
                )}
              </div>
            )}

            {/* Playing indicator overlay */}
            {isPlaying && (
              <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                <div className="w-16 h-16 rounded-full bg-accent/90 flex items-center justify-center animate-pulse">
                  <Play className="w-8 h-8 text-text-inverse ml-1" aria-hidden="true" />
                </div>
              </div>
            )}

            {/* Downloaded badge */}
            {isDownloaded && (
              <div className="absolute top-2 right-2">
                <span className="inline-flex items-center px-2 py-1 text-xs font-medium rounded-full bg-accent-soft text-accent">
                  <Download className="w-3 h-3 mr-1" aria-hidden="true" />
                  Offline
                </span>
              </div>
            )}

            {/* Duration badge */}
            {duration && (
              <div className="absolute bottom-2 right-2">
                <span className="inline-flex items-center px-1.5 py-0.5 text-xs font-medium rounded bg-black/80 text-text backdrop-blur-sm">
                  {formatDuration(duration)}
                </span>
              </div>
            )}

            {/* Smart Link badge */}
            {smartLink && (
              <button
                type="button"
                onClick={onSmartLinkClick}
                className="absolute bottom-2 left-2 inline-flex items-center gap-1 px-2 py-1 text-xs font-medium rounded-full bg-accent-soft text-accent border border-accent transition-all duration-200 hover:shadow-[0_0_8px_var(--accent)]"
                aria-label={smartLink.matched ? `Switch to ${variant === 'video' ? 'audio' : 'video'} version (${Math.round(smartLink.confidence * 100)}% match)` : 'Smart link available'}
              >
                <Link2 className="w-3 h-3" aria-hidden="true" />
                <span className="hidden sm:inline">{Math.round(smartLink.confidence * 100)}%</span>
              </button>
            )}
          </div>
        </div>

        <div className="flex flex-1 flex-col p-3 gap-2">
          <div className="flex items-start gap-2">
            <div className="flex-1 min-w-0">
              <h3 className={clsx('font-semibold truncate', textSizes[size])}>
                {title}
              </h3>
              <div className="flex items-center gap-2 mt-1 text-text-muted text-sm">
                <span className="truncate max-w-[150px]">{channelTitle}</span>
                {channelHandle && <span className="text-text-subtle">@{channelHandle}</span>}
                {publishedAt && <time dateTime={publishedAt}>{formatDate(publishedAt)}</time>}
              </div>
            </div>

            {/* Action buttons - visible on hover or always on expanded */}
            <div className={clsx('flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity', size === 'expanded' && 'opacity-100')}>
              {onQueue && (
                <button
                  type="button"
                  onClick={onQueue}
                  className="p-1.5 rounded-full bg-surface-hover text-text-muted hover:bg-accent-soft hover:text-accent transition-colors"
                  aria-label={isQueued ? 'Remove from queue' : 'Add to queue'}
                >
                  {isQueued ? (
                    <Video className="w-4 h-4" aria-hidden="true" />
                  ) : (
                    <span className="text-xs font-medium">+Q</span>
                  )}
                </button>
              )}
              {onDownload && !isDownloaded && (
                <button
                  type="button"
                  onClick={onDownload}
                  className="p-1.5 rounded-full bg-surface-hover text-text-muted hover:bg-audio-soft hover:text-audio transition-colors"
                  aria-label="Download"
                >
                  <Download className="w-4 h-4" aria-hidden="true" />
                </button>
              )}
            </div>
          </div>

          {/* Expanded details */}
          {size === 'expanded' && (
            <div className="pt-2 border-t border-border">
              <div className="flex flex-wrap items-center gap-3 text-sm text-text-muted">
                {duration && (
                  <span className="flex items-center gap-1">
                    <Clock className="w-4 h-4" aria-hidden="true" />
                    {formatDuration(duration)}
                  </span>
                )}
                {publishedAt && (
                  <time dateTime={publishedAt} className="flex items-center gap-1">
                    <Clock className="w-4 h-4" aria-hidden="true" />
                    {formatDate(publishedAt)}
                  </time>
                )}
                {smartLink && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent-soft text-accent border border-accent">
                    <Link2 className="w-3 h-3" aria-hidden="true" />
                    Smart Link: {Math.round(smartLink.confidence * 100)}%
                  </span>
                )}
              </div>
            </div>
          )}
        </div>
      </article>
    );
  }
);

EpisodeCard.displayName = 'EpisodeCard';