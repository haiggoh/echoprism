import { clsx } from 'clsx';
import { Plus, Search, WifiOff } from 'lucide-react';

export interface ConvergenceEmptyStateProps {
  variant?: 'onboarding' | 'no-subscriptions' | 'no-results' | 'offline';
  size?: 'full' | 'inline';
  title?: string;
  description?: string;
  ctaText?: string;
  onCtaClick?: () => void;
  className?: string;
}

const variantConfig = {
  onboarding: {
    title: 'Welcome to EchoPrism',
    description: 'Two streams. One flow. Add a channel to start the convergence.',
    ctaText: 'Browse Channels',
    illustration: 'prism',
  },
  'no-subscriptions': {
    title: 'No subscriptions yet',
    description: 'Add channels to fill your unified feed with videos and podcasts.',
    ctaText: 'Add Channels',
    illustration: 'prism',
  },
  'no-results': {
    title: 'No results found',
    description: 'Try adjusting your search or filters.',
    ctaText: 'Clear Filters',
    illustration: 'search',
  },
  offline: {
    title: 'You\'re offline',
    description: 'Check your connection and try again.',
    ctaText: 'Retry',
    illustration: 'wifi',
  },
};

export const ConvergenceEmptyState = ({
  variant = 'no-subscriptions',
  size = 'full',
  title,
  description,
  ctaText,
  onCtaClick,
  className = '',
}: ConvergenceEmptyStateProps) => {
  const config = variantConfig[variant];
  const displayTitle = title || config.title;
  const displayDescription = description || config.description;
  const displayCtaText = ctaText || config.ctaText;

  const sizeStyles = {
    full: 'py-12 px-6',
    inline: 'py-6 px-4',
  };

  const illustrationSizes = {
    full: 'w-24 h-24',
    inline: 'w-12 h-12',
  };

  const textSizes = {
    full: 'text-xl',
    inline: 'text-base',
  };

  const PrismIllustration = () => (
    <svg
      className={clsx('mx-auto text-text-muted', illustrationSizes[size])}
      viewBox="0 0 100 50"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="audioGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="var(--color-stream-audio)" />
          <stop offset="100%" stopColor="var(--color-stream-audio)" />
        </linearGradient>
        <linearGradient id="videoGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="var(--color-stream-video)" />
          <stop offset="100%" stopColor="var(--color-stream-video)" />
        </linearGradient>
        <linearGradient id="unifiedGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor="var(--color-stream-video)" />
          <stop offset="50%" stopColor="var(--color-stream-unified)" />
          <stop offset="100%" stopColor="var(--color-stream-audio)" />
        </linearGradient>
      </defs>

      {/* Prism triangle */}
      <polygon
        points="50,5 90,25 50,45 10,25"
        fill="none"
        stroke="url(#unifiedGradient)"
        strokeWidth="1.5"
        strokeDasharray="100"
        strokeDashoffset="0"
      />

      {/* Audio beam - enters top-left */}
      <path
        d="M 5,5 Q 35,10 50,5"
        stroke="var(--color-stream-audio)"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        opacity="0.8"
      />

      {/* Video beam - enters bottom-left */}
      <path
        d="M 5,45 Q 35,40 50,45"
        stroke="var(--color-stream-video)"
        strokeWidth="2"
        fill="none"
        strokeLinecap="round"
        opacity="0.8"
      />

      {/* Unified beam - exits right (only for onboarding/no-subscriptions) */}
      {['onboarding', 'no-subscriptions'].includes(variant) && (
        <path
          d="M 50,25 Q 70,25 95,25"
          stroke="url(#unifiedGradient)"
          strokeWidth="2.5"
          fill="none"
          strokeLinecap="round"
          opacity="0.8"
        />
      )}

      {/* Center pulse */}
      <circle
        cx="50"
        cy="25"
        r="4"
        fill="url(#unifiedGradient)"
        opacity="0.6"
      />
    </svg>
  );

  const SearchIllustration = () => (
    <div className={clsx('mx-auto flex items-center justify-center', illustrationSizes[size])}>
      <Search className="w-full h-full text-text-muted" aria-hidden="true" />
    </div>
  );

  const WifiIllustration = () => (
    <div className={clsx('mx-auto flex items-center justify-center', illustrationSizes[size])}>
      <WifiOff className="w-full h-full text-text-muted" aria-hidden="true" />
    </div>
  );

  const getIllustration = () => {
    switch (config.illustration) {
      case 'prism': return <PrismIllustration />;
      case 'search': return <SearchIllustration />;
      case 'wifi': return <WifiIllustration />;
      default: return <PrismIllustration />;
    }
  };

  return (
    <div
      className={clsx(
        'flex flex-col items-center text-center',
        sizeStyles[size],
        className
      )}
      role="status"
    >
      {getIllustration()}

      <h2 className={clsx('mt-4 font-semibold', textSizes[size])}>
        {displayTitle}
      </h2>

      <p className={clsx('mt-2 max-w-md text-text-muted', textSizes[size])}>
        {displayDescription}
      </p>

      {onCtaClick && displayCtaText && (
        <button
          type="button"
          onClick={onCtaClick}
          className={clsx(
            'mt-6 inline-flex items-center gap-2 px-4 py-2 rounded-md font-semibold transition-all duration-200',
            'bg-accent text-text-inverse hover:bg-accent-hover active:bg-accent/80',
            'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg'
          )}
        >
          {displayCtaText}
          <Plus className="w-4 h-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
};

ConvergenceEmptyState.displayName = 'ConvergenceEmptyState';