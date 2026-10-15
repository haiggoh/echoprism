import { forwardRef } from 'react';
import { clsx } from 'clsx';
import { Link2, Volume2, Video, AlertCircle, CheckCircle } from 'lucide-react';

export interface SmartLinkBadgeProps {
  variant?: 'high-confidence' | 'low-confidence' | 'manual' | 'conflict';
  size?: 'default' | 'compact';
  confidence: number;
  matched: boolean;
  currentFormat: 'audio' | 'video';
  onClick?: () => void;
  className?: string;
}

export const SmartLinkBadge = forwardRef<HTMLButtonElement, SmartLinkBadgeProps>(
  ({
    variant = 'high-confidence',
    size = 'default',
    confidence,
    matched,
    currentFormat,
    onClick,
    className = '',
  }, ref) => {
    const sizeStyles = {
      default: 'px-2 py-1 text-xs gap-1',
      compact: 'px-1.5 py-0.5 text-[10px] gap-0.5',
    };

    const iconSize = {
      default: 'w-3 h-3',
      compact: 'w-2.5 h-2.5',
    };

    const getVariantStyles = () => {
      switch (variant) {
        case 'high-confidence':
          return 'bg-accent-soft text-accent border-accent';
        case 'low-confidence':
          return 'bg-accent-soft/50 text-accent/70 border-accent/50 border-dashed';
        case 'manual':
          return 'bg-accent-soft text-accent border-accent';
        case 'conflict':
          return 'bg-danger-soft text-danger border-danger';
        default:
          return 'bg-accent-soft text-accent border-accent';
      }
    };

    const getIcon = () => {
      if (variant === 'conflict') return <AlertCircle className={iconSize[size]} aria-hidden="true" />;
      if (variant === 'manual' && matched) return <CheckCircle className={iconSize[size]} aria-hidden="true" />;
      return currentFormat === 'audio' ? (
        <Volume2 className={iconSize[size]} aria-hidden="true" />
      ) : (
        <Video className={iconSize[size]} aria-hidden="true" />
      );
    };

    const tooltipText = matched
      ? `Switch to ${currentFormat === 'video' ? 'audio' : 'video'} version (${Math.round(confidence * 100)}% match)`
      : `Smart link available (${Math.round(confidence * 100)}% match)`;

    return (
      <button
        ref={ref}
        type="button"
        onClick={onClick}
        disabled={!matched && variant !== 'manual'}
        className={clsx(
          'inline-flex items-center rounded-full border transition-all duration-200',
          'hover:shadow-[0_0_8px_var(--accent)]',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          sizeStyles[size],
          getVariantStyles(),
          className
        )}
        aria-label={tooltipText}
        title={tooltipText}
      >
        <Link2 className={iconSize[size]} aria-hidden="true" />
        {getIcon()}
        <span className="font-medium hidden sm:inline">
          {Math.round(confidence * 100)}%
        </span>
      </button>
    );
  }
);

SmartLinkBadge.displayName = 'SmartLinkBadge';