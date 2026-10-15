import { forwardRef } from 'react';
import { clsx } from 'clsx';
import { Video, Volume2, List } from 'lucide-react';

export interface FeedFilterTabsProps {
  activeTab: 'all' | 'video' | 'podcast' | 'queue';
  onChange: (tab: 'all' | 'video' | 'podcast' | 'queue') => void;
  counts?: {
    all: number;
    video: number;
    podcast: number;
    queue: number;
  };
  size?: 'default' | 'compact';
  className?: string;
}

const tabs = [
  { id: 'all', label: 'All', icon: List },
  { id: 'video', label: 'Video', icon: Video },
  { id: 'podcast', label: 'Podcast', icon: Volume2 },
  { id: 'queue', label: 'Queue', icon: List },
] as const;

export const FeedFilterTabs = forwardRef<HTMLDivElement, FeedFilterTabsProps>(
  ({
    activeTab,
    onChange,
    counts = { all: 0, video: 0, podcast: 0, queue: 0 },
    size = 'default',
    className = '',
  }, ref) => {
    const sizeStyles = {
      default: 'px-3 py-1.5 text-sm',
      compact: 'px-2 py-1 text-xs',
    };

    const iconSize = {
      default: 'w-4 h-4',
      compact: 'w-3.5 h-3.5',
    };

    return (
      <div
        ref={ref}
        role="tablist"
        aria-label="Feed filters"
        className={clsx(
          'flex items-center gap-1 bg-surface border border-border rounded-md p-1',
          className
        )}
      >
        {tabs.map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            role="tab"
            aria-selected={activeTab === id}
            aria-controls={`feed-panel-${id}`}
            id={`feed-tab-${id}`}
            onClick={() => onChange(id)}
            className={clsx(
              'relative inline-flex items-center gap-1.5 rounded-md transition-all duration-200',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg',
              activeTab === id
                ? 'bg-accent text-text-inverse shadow-sm'
                : 'text-text-muted hover:text-text hover:bg-surface-hover',
              sizeStyles[size]
            )}
          >
            <Icon className={clsx(iconSize[size], 'flex-shrink-0')} aria-hidden="true" />
            <span className="font-medium hidden sm:inline">{label}</span>
            {counts[id] > 0 && (
              <span className={clsx(
                'inline-flex items-center justify-center min-w-[1.25rem] h-5 rounded-full text-xs font-semibold',
                activeTab === id
                  ? 'bg-text-inverse text-accent'
                  : 'bg-surface-hover text-text-muted'
              )}>
                {counts[id] > 999 ? '999+' : counts[id]}
              </span>
            )}
          </button>
        ))}
      </div>
    );
  }
);

FeedFilterTabs.displayName = 'FeedFilterTabs';