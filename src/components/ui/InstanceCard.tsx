import { forwardRef } from 'react';
import { clsx } from 'clsx';
import { CheckCircle, AlertCircle, XCircle, Loader2, Pin, MoreHorizontal, Wifi, Zap, Globe } from 'lucide-react';

export interface InstanceCardProps {
  size?: 'list' | 'expanded' | 'compact';
  url: string;
  type: 'invidious' | 'piped';
  health: 'healthy' | 'degraded' | 'failed' | 'unknown' | 'testing';
  latencyMs?: number;
  lastChecked?: string;
  autoFailover?: boolean;
  supportsSabr?: boolean;
  supportsAgeRestricted?: boolean;
  region?: string;
  country?: string;
  pinned?: boolean;
  isSelected?: boolean;
  onTest?: () => void;
  onFailover?: () => void;
  onTogglePin?: () => void;
  onToggleAutoFailover?: () => void;
  onMore?: () => void;
  className?: string;
}

const formatLatency = (ms: number | undefined): string => {
  if (ms === undefined) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
};

const formatLastChecked = (dateString: string | undefined): string => {
  if (!dateString) return 'Never';
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  const diffMins = Math.floor(diffSecs / 60);
  const diffHours = Math.floor(diffMins / 60);

  if (diffHours > 24) return `${Math.floor(diffHours / 24)}d ago`;
  if (diffHours > 0) return `${diffHours}h ago`;
  if (diffMins > 0) return `${diffMins}m ago`;
  return `${diffSecs}s ago`;
};

export const InstanceCard = forwardRef<HTMLDivElement, InstanceCardProps>(
  ({
    size = 'list',
    url,
    type,
    health,
    latencyMs,
    lastChecked,
    autoFailover = true,
    supportsSabr = false,
    supportsAgeRestricted = false,
    region,
    country,
    pinned = false,
    isSelected = false,
    onTest,
    onFailover,
    onTogglePin,
    onToggleAutoFailover,
    onMore,
    className = '',
  }, ref) => {
    const sizeStyles = {
      list: 'p-3',
      expanded: 'p-4',
      compact: 'p-2',
    };

    const textSizes = {
      list: 'text-sm',
      expanded: 'text-base',
      compact: 'text-xs',
    };

    const getHealthStyles = () => {
      switch (health) {
        case 'healthy':
          return 'bg-success-soft text-success border-success';
        case 'degraded':
          return 'bg-warning-soft text-warning border-warning';
        case 'failed':
          return 'bg-danger-soft text-danger border-danger';
        case 'testing':
          return 'bg-accent-soft text-accent border-accent';
        default:
          return 'bg-surface text-text-muted border-border';
      }
    };

    const getHealthIcon = () => {
      switch (health) {
        case 'healthy': return <CheckCircle className="w-4 h-4" aria-hidden="true" />;
        case 'degraded': return <AlertCircle className="w-4 h-4" aria-hidden="true" />;
        case 'failed': return <XCircle className="w-4 h-4" aria-hidden="true" />;
        case 'testing': return <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" />;
        default: return <span className="w-4 h-4" aria-hidden="true">?</span>;
      }
    };

    const getTypeIcon = () => {
      return type === 'piped' ? (
        <span className="text-2xl" aria-hidden="true">🎵</span>
      ) : (
        <span className="text-2xl" aria-hidden="true">▶️</span>
      );
    };

    return (
      <article
        ref={ref}
        className={clsx(
          'relative flex items-start gap-3 bg-surface border rounded-md transition-all duration-200',
          'hover:border-border-input hover:shadow-card',
          isSelected && 'border-accent bg-accent-soft/50',
          getHealthStyles(),
          sizeStyles[size],
          className
        )}
      >
        <div className="flex-shrink-0 w-12 h-12 rounded-lg bg-surface-hover flex items-center justify-center">
          {getTypeIcon()}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0 flex items-center gap-2">
              <span className={clsx('font-mono font-medium truncate max-w-[200px]', textSizes[size])}>
                {url.replace(/^https?:\/\//, '').replace(/\/+$/, '')}
              </span>
              {pinned && onTogglePin && (
                <button
                  type="button"
                  onClick={onTogglePin}
                  className="p-1 rounded-full text-accent hover:bg-accent-soft transition-colors"
                  aria-label="Unpin instance"
                  aria-pressed={true}
                >
                  <Pin className="w-4 h-4 fill-current" aria-hidden="true" />
                </button>
              )}
            </div>

            {size !== 'compact' && onMore && (
              <button
                type="button"
                onClick={onMore}
                className="p-1 rounded-full bg-surface-hover/50 text-text-muted hover:bg-accent-soft hover:text-accent transition-colors opacity-0 group-hover:opacity-100"
                aria-label="More options"
              >
                <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 mt-2">
            <span className={clsx('inline-flex items-center gap-1 font-medium', textSizes[size], getHealthStyles())}>
              {getHealthIcon()}
              <span className="capitalize">{health}</span>
            </span>

            {latencyMs !== undefined && (
              <span className={clsx('inline-flex items-center gap-1 font-mono', textSizes[size])}>
                <Zap className="w-3 h-3" aria-hidden="true" />
                {formatLatency(latencyMs)}
              </span>
            )}

            {supportsSabr && (
              <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent-soft text-accent text-xs font-medium border border-accent', textSizes[size])}>
                <Zap className="w-3 h-3" aria-hidden="true" />
                SABR
              </span>
            )}

            {supportsAgeRestricted && (
              <span className={clsx('inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-warning-soft text-warning text-xs font-medium border border-warning', textSizes[size])}>
                <AlertCircle className="w-3 h-3" aria-hidden="true" />
                Age-restricted
              </span>
            )}

            {(region || country) && (
              <span className={clsx('inline-flex items-center gap-1', textSizes[size])}>
                <Globe className="w-3 h-3" aria-hidden="true" />
                {region || country}
              </span>
            )}
          </div>

          {lastChecked && (
            <div className="mt-2">
              <span className={clsx('text-text-subtle', textSizes[size])}>
                Last checked: {formatLastChecked(lastChecked)}
              </span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          {onTest && (
            <button
              type="button"
              onClick={onTest}
              disabled={health === 'testing'}
              className={clsx(
                'px-3 py-1.5 rounded-md text-sm font-medium transition-all duration-200',
                'bg-transparent border border-border-input text-text-muted hover:bg-accent-soft hover:text-accent',
                'disabled:opacity-50 disabled:cursor-not-allowed'
              )}
              aria-label="Test instance health"
            >
              {health === 'testing' ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" aria-hidden="true" />
                  Testing...
                </>
              ) : (
                <>
                  <Wifi className="w-4 h-4 mr-1.5" aria-hidden="true" />
                  Test
                </>
              )}
            </button>
          )}

          {health !== 'healthy' && onFailover && (
            <button
              type="button"
              onClick={onFailover}
              className="px-3 py-1.5 rounded-md text-sm font-medium bg-danger text-text-inverse hover:bg-danger-hover transition-all duration-200"
              aria-label="Failover to this instance"
            >
              Failover
            </button>
          )}

          {onTogglePin && !pinned && (
            <button
              type="button"
              onClick={onTogglePin}
              className="p-1.5 rounded-full bg-surface-hover text-text-muted hover:bg-accent-soft hover:text-accent transition-colors"
              aria-label="Pin instance"
            >
              <Pin className="w-4 h-4" aria-hidden="true" />
            </button>
          )}

          {onToggleAutoFailover && (
            <button
              type="button"
              onClick={onToggleAutoFailover}
              className={clsx(
                'p-1.5 rounded-full transition-colors',
                autoFailover
                  ? 'bg-accent-soft text-accent'
                  : 'bg-surface-hover text-text-muted hover:bg-accent-soft hover:text-accent'
              )}
              aria-label={autoFailover ? 'Disable auto-failover' : 'Enable auto-failover'}
              aria-pressed={autoFailover}
            >
              <Zap className={clsx('w-4 h-4', autoFailover && 'fill-current')} aria-hidden="true" />
            </button>
          )}
        </div>
      </article>
    );
  }
);

InstanceCard.displayName = 'InstanceCard';