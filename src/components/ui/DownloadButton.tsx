import { clsx } from 'clsx';
import { Loader2, Check, FileVideo, FileAudio } from 'lucide-react';

export interface DownloadButtonProps {
  variant?: 'video' | 'audio' | 'with-quality';
  size?: 'default' | 'compact' | 'with-label';
  status?: 'idle' | 'downloading' | 'downloaded' | 'failed' | 'queued';
  progress?: number; // 0-100
  quality?: string;
  onClick?: () => void;
  onCancel?: () => void;
  onRetry?: () => void;
  onDelete?: () => void;
  className?: string;
}

const sizeStyles = {
  default: 'px-3 py-1.5 gap-2',
  compact: 'px-2 py-1 gap-1.5',
  'with-label': 'px-4 py-2 gap-2',
};

const iconSizes = {
  default: 'w-5 h-5',
  compact: 'w-4 h-4',
  'with-label': 'w-5 h-5',
};

export const DownloadButton = ({
  variant = 'video',
  size = 'default',
  status = 'idle',
  progress = 0,
  quality,
  onClick,
  onCancel,
  onRetry,
  onDelete,
  className = '',
}: DownloadButtonProps) => {
  const isVideoFormat = variant === 'video' || variant === 'with-quality';

  if (status === 'downloading') {
    return (
      <button
        type="button"
        onClick={onCancel}
        className={clsx(
          'inline-flex items-center',
          sizeStyles[size],
          className
        )}
        aria-label="Cancel download"
        aria-busy="true"
      >
        <Loader2 className={clsx('animate-spin text-accent', iconSizes[size])} aria-hidden="true" />
        {size !== 'compact' && (
          <span className="text-sm font-mono text-accent">
            {Math.round(progress)}%
          </span>
        )}
        <span className="sr-only">Downloading... {Math.round(progress)}%</span>
      </button>
    );
  }

  if (status === 'downloaded') {
    return (
      <button
        type="button"
        onClick={onDelete}
        className={clsx(
          'inline-flex items-center bg-success-soft text-success border border-success',
          sizeStyles[size],
          className
        )}
        aria-label="Delete downloaded file"
      >
        <Check className={clsx('fill-current', iconSizes[size])} aria-hidden="true" />
        {size !== 'compact' && (
          <span className="text-sm font-medium">Downloaded</span>
        )}
        <span className="sr-only">Downloaded. Click to delete.</span>
      </button>
    );
  }

  if (status === 'failed') {
    return (
      <button
        type="button"
        onClick={onRetry}
        className={clsx(
          'inline-flex items-center bg-danger-soft text-danger border border-danger',
          sizeStyles[size],
          className
        )}
        aria-label="Retry download"
      >
        <span className="text-sm font-medium">Retry</span>
        <span className="sr-only">Download failed. Click to retry.</span>
      </button>
    );
  }

  if (status === 'queued') {
    return (
      <button
        type="button"
        onClick={onCancel}
        className={clsx(
          'inline-flex items-center bg-warning-soft text-warning border border-warning',
          sizeStyles[size],
          className
        )}
        aria-label="Cancel queued download"
      >
        <Loader2 className={clsx('animate-pulse text-warning', iconSizes[size])} aria-hidden="true" />
        {size !== 'compact' && (
          <span className="text-sm font-medium">Queued</span>
        )}
      </button>
    );
  }

  // Default idle state
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'inline-flex items-center',
        sizeStyles[size],
        isVideoFormat
          ? 'bg-transparent border border-video text-video hover:bg-video hover:text-bg'
          : 'bg-transparent border border-audio text-audio hover:bg-audio hover:text-bg',
        className
      )}
      aria-label={`Download ${isVideoFormat ? 'video' : 'audio'}`}
    >
      {isVideoFormat ? (
        <FileVideo className={iconSizes[size]} aria-hidden="true" />
      ) : (
        <FileAudio className={iconSizes[size]} aria-hidden="true" />
      )}
      {size !== 'compact' && (
        <>
          <span className="text-sm font-medium">
            {quality || (isVideoFormat ? 'Video' : 'Audio')}
          </span>
          {variant === 'with-quality' && quality && (
            <span className="text-xs text-text-muted px-2 py-0.5 rounded bg-surface border border-border">
              {quality}
            </span>
          )}
        </>
      )}
      <span className="sr-only">
        Download {isVideoFormat ? 'video' : 'audio'}{quality ? ` (${quality})` : ''}
      </span>
    </button>
  );
}

DownloadButton.displayName = 'DownloadButton';