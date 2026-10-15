import { forwardRef } from 'react';
import { clsx } from 'clsx';
import { Music, Video, Link2 } from 'lucide-react';

export interface PrismConvergeToggleProps {
  value: 'unified' | 'audio' | 'video';
  onChange: (value: 'unified' | 'audio' | 'video') => void;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  className?: string;
}

export const PrismConvergeToggle = forwardRef<HTMLDivElement, PrismConvergeToggleProps>(
  ({ value, onChange, size = 'md', disabled = false, className = '' }, ref) => {
    const sizeStyles = {
      sm: 'h-8 gap-1 px-2',
      md: 'h-10 gap-2 px-3',
      lg: 'h-12 gap-3 px-4',
    };

    const iconSize = {
      sm: 'w-4 h-4',
      md: 'w-5 h-5',
      lg: 'w-6 h-6',
    };

    const handleClick = (newValue: 'unified' | 'audio' | 'video') => {
      if (!disabled) onChange(newValue);
    };

    return (
      <div
        ref={ref}
        className={clsx(
          'inline-flex items-center rounded-md bg-surface border border-border-input',
          sizeStyles[size],
          className
        )}
        role="radiogroup"
        aria-label="Playback format"
        aria-disabled={disabled}
      >
        <button
          type="button"
          role="radio"
          aria-checked={value === 'audio'}
          aria-label="Audio only mode"
          onClick={() => handleClick('audio')}
          disabled={disabled}
          className={clsx(
            'relative flex items-center justify-center rounded-l-md transition-all duration-200',
            value === 'audio'
              ? 'bg-audio text-bg font-semibold'
              : 'bg-transparent text-text-muted hover:text-audio',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
          style={{ minWidth: size === 'sm' ? '2.5rem' : size === 'md' ? '3rem' : '3.5rem' }}
        >
          <Music className={clsx(iconSize[size], 'flex-shrink-0')} aria-hidden="true" />
        </button>

        <button
          type="button"
          role="radio"
          aria-checked={value === 'unified'}
          aria-label="Unified mode (auto switch audio/video)"
          onClick={() => handleClick('unified')}
          disabled={disabled}
          className={clsx(
            'relative flex items-center justify-center transition-all duration-200',
            value === 'unified'
              ? 'bg-accent text-text-inverse font-semibold'
              : 'bg-transparent text-text-muted hover:text-accent',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
          style={{ minWidth: size === 'sm' ? '3rem' : size === 'md' ? '3.5rem' : '4rem' }}
        >
          <Link2 className={clsx(iconSize[size], 'flex-shrink-0')} aria-hidden="true" />
          {value === 'unified' && (
            <span className="absolute inset-y-0 left-1/2 -translate-x-1/2 w-px bg-gradient-to-r from-audio via-accent to-video opacity-60" aria-hidden="true" />
          )}
        </button>

        <button
          type="button"
          role="radio"
          aria-checked={value === 'video'}
          aria-label="Video mode"
          onClick={() => handleClick('video')}
          disabled={disabled}
          className={clsx(
            'relative flex items-center justify-center rounded-r-md transition-all duration-200',
            value === 'video'
              ? 'bg-video text-bg font-semibold'
              : 'bg-transparent text-text-muted hover:text-video',
            disabled && 'opacity-50 cursor-not-allowed'
          )}
          style={{ minWidth: size === 'sm' ? '2.5rem' : size === 'md' ? '3rem' : '3.5rem' }}
        >
          <Video className={clsx(iconSize[size], 'flex-shrink-0')} aria-hidden="true" />
        </button>
      </div>
    );
  }
);

PrismConvergeToggle.displayName = 'PrismConvergeToggle';