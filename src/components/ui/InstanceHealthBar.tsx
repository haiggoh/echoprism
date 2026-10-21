import { clsx } from 'clsx';

export interface InstanceHealthBarProps {
  variant?: 'latency' | 'health';
  value: number; // 0-100 for latency, or health index
  max?: number;
  size?: 'default' | 'compact';
  showLabel?: boolean;
  label?: string;
  className?: string;
}

const healthLabels = ['Unknown', 'Failed', 'Degraded', 'Healthy'];
const healthColors = ['border-border', 'border-danger', 'border-warning', 'border-success'];
const healthBgColors = ['bg-border', 'bg-danger-soft', 'bg-warning-soft', 'bg-success-soft'];

export const InstanceHealthBar = ({
  variant = 'latency',
  value,
  max = 100,
  size = 'default',
  showLabel = true,
  label,
  className = '',
}: InstanceHealthBarProps) => {
  const percentage = Math.min(100, Math.max(0, (value / max) * 100));
  const healthIndex = Math.min(3, Math.max(0, Math.round((value / max) * 3)));

  const sizeStyles = {
    default: 'h-2',
    compact: 'h-1.5',
  };

  const labelSizes = {
    default: 'text-xs',
    compact: 'text-[10px]',
  };

  if (variant === 'health') {
    return (
      <div className={clsx('flex items-center gap-2', className)}>
        {showLabel && label && (
          <span className={clsx('font-medium text-text-muted', labelSizes[size])}>
            {label}
          </span>
        )}
        <div className={clsx('flex-1 relative', sizeStyles[size])}>
          <div className="relative h-full bg-surface rounded-full overflow-hidden">
            <div
              className={clsx(
                'h-full rounded-full transition-all duration-500',
                healthBgColors[healthIndex],
                healthColors[healthIndex]
              )}
              style={{ width: `${percentage}%` }}
            />
          </div>
          {showLabel && (
            <span className={clsx('absolute right-0 top-1/2 -translate-y-1/2 translate-x-full pr-1 font-mono font-medium', labelSizes[size])}>
              {healthLabels[healthIndex]}
            </span>
          )}
        </div>
      </div>
    );
  }

  // Latency variant
  const getLatencyColor = (pct: number) => {
    if (pct < 30) return 'bg-success';
    if (pct < 60) return 'bg-warning';
    if (pct < 85) return 'bg-warning-strong';
    return 'bg-danger';
  };

  return (
    <div className={clsx('flex items-center gap-2', className)}>
      {showLabel && label && (
        <span className={clsx('font-medium text-text-muted', labelSizes[size])}>
          {label}
        </span>
      )}
      <div className={clsx('flex-1 relative', sizeStyles[size])}>
        <div className="relative h-full bg-surface rounded-full overflow-hidden">
          <div
            className={clsx('h-full rounded-full transition-all duration-300', getLatencyColor(percentage))}
            style={{ width: `${percentage}%` }}
          />
        </div>
        {showLabel && (
          <span className={clsx('absolute right-0 top-1/2 -translate-y-1/2 translate-x-full pr-1 font-mono font-medium', labelSizes[size])}>
            {value < 1000 ? `${value}ms` : `${(value / 1000).toFixed(1)}s`}
          </span>
        )}
      </div>
    </div>
  );
};

InstanceHealthBar.displayName = 'InstanceHealthBar';