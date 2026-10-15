import { clsx } from 'clsx';

export interface ConvergenceLoaderProps {
  variant?: 'beams' | 'pulse' | 'spinner' | 'skeleton';
  size?: 'full' | 'card' | 'inline';
  className?: string;
}

export const ConvergenceLoader = ({
  variant = 'beams',
  size = 'full',
  className = '',
}: ConvergenceLoaderProps) => {
  const sizeStyles = {
    full: 'w-64 h-64',
    card: 'w-48 h-48',
    inline: 'w-8 h-8',
  };

  if (variant === 'skeleton') {
    return (
      <div className={clsx('space-y-3', className)}>
        <div className="h-4 bg-surface-hover rounded animate-pulse" style={{ width: '60%' }} />
        <div className="h-4 bg-surface-hover rounded animate-pulse" style={{ width: '40%' }} />
        <div className="h-4 bg-surface-hover rounded animate-pulse" style={{ width: '80%' }} />
        <div className="h-4 bg-surface-hover rounded animate-pulse" style={{ width: '50%' }} />
      </div>
    );
  }

  if (variant === 'pulse') {
    return (
      <div className={clsx('flex items-center justify-center', sizeStyles[size], className)}>
        <div className="relative">
          <div className="absolute inset-0 bg-accent-soft rounded-full pulse-unified" aria-hidden="true" />
          <div className="relative bg-accent rounded-full pulse-unified" style={{ animationDelay: '200ms' }} aria-hidden="true">
            <div className={clsx('flex items-center justify-center', size === 'inline' ? 'w-8 h-8' : 'w-full h-full')}>
              <svg className="w-full h-full text-text-inverse" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
                <path d="M12 2L2 7l10 5 10-5-10-5z" />
                <path d="M2 17l10 5 10-5" />
                <path d="M2 12l10 5 10-5" />
              </svg>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (variant === 'spinner') {
    return (
      <div className={clsx('flex items-center justify-center', sizeStyles[size], className)}>
        <svg className="animate-spin text-accent" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <path d="M12 2L2 7l10 5 10-5-10-5z" />
          <path d="M2 17l10 5 10-5" />
          <path d="M2 12l10 5 10-5" />
        </svg>
      </div>
    );
  }

  // Default: beams variant
  return (
    <div className={clsx('relative flex items-center justify-center', sizeStyles[size], className)}>
      <svg className="w-full h-full" viewBox="0 0 200 100" aria-hidden="true">
        <defs>
          <linearGradient id="audioGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#FF8C42" />
            <stop offset="100%" stopColor="#FF8C42" />
          </linearGradient>
          <linearGradient id="videoGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#00D4C8" />
            <stop offset="100%" stopColor="#00D4C8" />
          </linearGradient>
          <linearGradient id="unifiedGradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#FF8C42" />
            <stop offset="50%" stopColor="#10F0A8" />
            <stop offset="100%" stopColor="#00D4C8" />
          </linearGradient>
        </defs>

        {/* Prism triangle */}
        <polygon
          points="100,10 180,50 100,90 20,50"
          fill="none"
          stroke="url(#unifiedGradient)"
          strokeWidth="2"
          className="converge-spring"
          strokeDasharray="300"
          strokeDashoffset="0"
        />

        {/* Audio beam - enters top-left */}
        <path
          d="M 10,10 Q 50,15 100,10"
          stroke="url(#audioGradient)"
          strokeWidth="3"
          fill="none"
          className="converge-audio"
          strokeDasharray="200"
          strokeDashoffset="0"
          strokeLinecap="round"
        />

        {/* Video beam - enters bottom-left */}
        <path
          d="M 10,90 Q 50,85 100,90"
          stroke="url(#videoGradient)"
          strokeWidth="3"
          fill="none"
          className="converge-video"
          strokeDasharray="200"
          strokeDashoffset="0"
          strokeLinecap="round"
        />

        {/* Unified beam - exits right */}
        <path
          d="M 100,50 Q 150,50 190,50"
          stroke="url(#unifiedGradient)"
          strokeWidth="4"
          fill="none"
          className="emerge-unified"
          strokeDasharray="150"
          strokeDashoffset="0"
          strokeLinecap="round"
        />

        {/* Center pulse */}
        <circle
          cx="100"
          cy="50"
          r="8"
          fill="url(#unifiedGradient)"
          className="pulse-unified"
          opacity="0.6"
        />
      </svg>
    </div>
  );
};

ConvergenceLoader.displayName = 'ConvergenceLoader';