import { forwardRef } from 'react';
import { clsx } from 'clsx';
import { Bell, Plus, MoreHorizontal } from 'lucide-react';

export interface ChannelCardProps {
  size?: 'feed' | 'compact' | 'expanded';
  title: string;
  handle?: string;
  thumbnailUrl?: string;
  subscriberCount?: number;
  isSubscribed: boolean;
  notificationsEnabled?: boolean;
  type?: 'video' | 'podcast' | 'both';
  onSubscribe?: () => void;
  onUnsubscribe?: () => void;
  onToggleNotifications?: () => void;
  onMore?: () => void;
  className?: string;
}

const formatCount = (count: number): string => {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return count.toString();
};

export const ChannelCard = forwardRef<HTMLDivElement, ChannelCardProps>(
  ({
    size = 'feed',
    title,
    handle,
    thumbnailUrl,
    subscriberCount,
    isSubscribed,
    notificationsEnabled = false,
    type = 'video',
    onSubscribe,
    onUnsubscribe,
    onToggleNotifications,
    onMore,
    className = '',
  }, ref) => {
    const sizeStyles = {
      feed: 'w-full max-w-sm',
      compact: 'w-full',
      expanded: 'w-full max-w-2xl',
    };

    const thumbnailStyles = {
      feed: 'w-16 h-16 rounded-full flex-shrink-0',
      compact: 'w-12 h-12 rounded-full flex-shrink-0',
      expanded: 'w-20 h-20 rounded-full flex-shrink-0',
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
          'group relative flex items-start gap-3 p-3 bg-surface border border-border rounded-md transition-all duration-200',
          'hover:border-border-input hover:shadow-card',
          isSubscribed && 'border-accent/30 bg-accent-soft/50',
          sizeStyles[size],
          className
        )}
      >
        <div className={clsx('relative flex-shrink-0 overflow-hidden', thumbnailStyles[size])}>
          {thumbnailUrl ? (
            <img
              src={thumbnailUrl}
              alt=""
              className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
              loading="lazy"
            />
          ) : (
            <div className="w-full h-full bg-surface-hover flex items-center justify-center">
              {type === 'podcast' ? (
                <span className="text-2xl" aria-hidden="true">🎙️</span>
              ) : type === 'both' ? (
                <span className="text-2xl" aria-hidden="true">📺</span>
              ) : (
                <span className="text-2xl" aria-hidden="true">▶️</span>
              )}
            </div>
          )}
        </div>

        <div className="flex-1 min-w-0 flex flex-col justify-between">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className={clsx('font-semibold truncate', textSizes[size])}>
                {title}
              </h3>
              {handle && (
                <span className="text-text-muted truncate block text-sm">@{handle}</span>
              )}
            </div>

            {size !== 'compact' && onMore && (
              <button
                type="button"
                onClick={onMore}
                className="p-1 rounded-full bg-surface-hover text-text-muted hover:bg-accent-soft hover:text-accent transition-colors opacity-0 group-hover:opacity-100"
                aria-label="More options"
              >
                <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 mt-2 text-sm text-text-muted">
            {subscriberCount && (
              <span className="flex items-center gap-1">
                <span aria-hidden="true">👥</span>
                {formatCount(subscriberCount)} subscribers
              </span>
            )}
            {type !== 'video' && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent-soft text-accent text-xs font-medium border border-accent">
                {type === 'podcast' ? '🎙️ Podcast' : '📺 Video + 🎙️ Podcast'}
              </span>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {isSubscribed ? (
            <div className="flex items-center gap-2">
              {onToggleNotifications && (
                <button
                  type="button"
                  onClick={onToggleNotifications}
                  className={clsx(
                    'p-2 rounded-full transition-colors',
                    notificationsEnabled
                      ? 'bg-accent-soft text-accent'
                      : 'bg-surface-hover text-text-muted hover:bg-accent-soft hover:text-accent'
                  )}
                  aria-label={notificationsEnabled ? 'Disable notifications' : 'Enable notifications'}
                  aria-pressed={notificationsEnabled}
                >
                  <Bell className={clsx('w-5 h-5', notificationsEnabled && 'fill-current')} aria-hidden="true" />
                </button>
              )}
              {onUnsubscribe && (
                <button
                  type="button"
                  onClick={onUnsubscribe}
                  className="px-3 py-1.5 text-sm font-medium rounded-md bg-transparent border border-border-input text-text-muted hover:bg-surface-hover hover:text-text transition-colors"
                  aria-label="Unsubscribe"
                >
                  Subscribed
                </button>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={onSubscribe}
              className="px-4 py-2 text-sm font-semibold rounded-md bg-accent text-text-inverse hover:bg-accent-hover active:bg-accent/80 transition-all duration-200"
              aria-label="Subscribe"
            >
              <Plus className="w-4 h-4 mr-1.5" aria-hidden="true" />
              Subscribe
            </button>
          )}
        </div>
      </article>
    );
  }
);

ChannelCard.displayName = 'ChannelCard';