import { clsx } from 'clsx';

export interface SponsorBlockMarkerProps {
  variant?: 'sponsor' | 'selfpromo' | 'interaction' | 'intro' | 'outro' | 'preview' | 'poi_highlight' | 'chapter';
  size?: 'timeline' | 'chapter';
  startTime: number;
  endTime: number;
  title?: string;
  onClick?: () => void;
  isCurrent?: boolean;
  isSkipped?: boolean;
  className?: string;
}

const variantConfig = {
  sponsor: { color: 'bg-audio', label: 'Sponsor' },
  selfpromo: { color: 'bg-audio/70', label: 'Self Promo' },
  interaction: { color: 'bg-video', label: 'Interaction' },
  intro: { color: 'bg-accent/70', label: 'Intro' },
  outro: { color: 'bg-accent', label: 'Outro' },
  preview: { color: 'bg-video/70', label: 'Preview' },
  poi_highlight: { color: 'bg-audio', label: 'Highlight' },
  chapter: { color: 'bg-accent', label: 'Chapter' },
};

const formatTime = (seconds: number): string => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  if (hours > 0) return `${hours}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
};

export const SponsorBlockMarker = ({
  variant = 'sponsor',
  size = 'timeline',
  startTime,
  endTime,
  title,
  onClick,
  isCurrent = false,
  isSkipped = false,
  className = '',
}: SponsorBlockMarkerProps) => {
  const config = variantConfig[variant];
  const duration = endTime - startTime;
  // const displayTitle = title || config.label; // Used in tooltip

  const sizeStyles = {
    timeline: 'h-full min-w-[4px] rounded-sm cursor-pointer',
    chapter: 'h-2 min-w-[8px] rounded cursor-pointer',
  };

  const getColorClass = () => {
    if (isSkipped) return 'opacity-30';
    if (isCurrent) return 'ring-2 ring-text-inverse';
    return '';
  };

  const tooltipText = `${title || config.label}: ${formatTime(startTime)} - ${formatTime(endTime)} (${formatTime(duration)})`;

  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        'relative transition-all duration-200',
        sizeStyles[size],
        getColorClass(),
        config.color,
        className
      )}
      title={tooltipText}
      aria-label={tooltipText}
    >
      {size === 'chapter' && (
        <span className="absolute -top-5 left-0 text-[10px] font-medium text-text-muted whitespace-nowrap">
          {formatTime(startTime)}
        </span>
      )}
      {isCurrent && (
        <div className="absolute -top-6 left-1/2 -translate-x-1/2 px-1.5 py-0.5 text-[10px] font-medium rounded bg-text text-text-inverse whitespace-nowrap">
          NOW
        </div>
      )}
      {isSkipped && (
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-text-inverse/50 text-[10px] font-medium">SKIPPED</span>
        </div>
      )}
    </button>
  );
};

SponsorBlockMarker.displayName = 'SponsorBlockMarker';