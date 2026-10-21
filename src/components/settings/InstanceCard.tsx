interface InstanceCardProps {
  instance: {
    id: string;
    url: string;
    type: 'invidious' | 'piped';
    health: 'healthy' | 'degraded' | 'failed' | 'unknown';
    latency_ms?: number;
    last_checked?: string;
    supports_sabr: boolean;
    supports_age_restricted: boolean;
    region?: string;
    country?: string;
    pinned: boolean;
  };
  onTest?: () => void;
  onRemove?: () => void;
  onPin?: () => void;
}

export function InstanceCard({ instance, onTest, onRemove, onPin }: InstanceCardProps) {
  const healthColors = {
    healthy: 'text-success border-success',
    degraded: 'text-warning border-warning',
    failed: 'text-danger border-danger',
    unknown: 'text-text-muted border-border',
  };

  const healthLabels = {
    healthy: 'Healthy',
    degraded: 'Degraded',
    failed: 'Failed',
    unknown: 'Unknown',
  };

  return (
    <article className={`bg-surface border rounded-xl p-4 transition-all ${instance.pinned ? 'ring-2 ring-accent' : ''}`}>
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap gap-1 mb-2">
            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${instance.type === 'invidious' ? 'bg-audio-soft text-audio' : 'bg-video-soft text-video'}`}>
              {instance.type.toUpperCase()}
            </span>
            <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${instance.pinned ? 'bg-warning-soft text-warning' : ''}`}>
              {instance.pinned ? 'Pinned' : ''}
            </span>
            {instance.supports_sabr && (
              <span className="px-2 py-0.5 text-xs font-medium bg-accent-soft text-accent">
                SABR
              </span>
            )}
            {instance.supports_age_restricted && (
              <span className="px-2 py-0.5 text-xs font-medium bg-warning-soft text-warning">
                Age-gated
              </span>
            )}
          </div>
          
          <p className="font-mono text-sm text-text-muted truncate">{instance.url}</p>
          
          <div className="flex items-center gap-4 mt-2 text-sm text-text-muted">
            {instance.region && <span>{instance.region}</span>}
            {instance.country && <span>{instance.country}</span>}
            {instance.latency_ms && <span>{instance.latency_ms}ms</span>}
          </div>
        </div>

        <div className="flex items-center gap-2 flex-shrink-0">
          <div className={`flex items-center gap-2 ${healthColors[instance.health]}`}>
            <span className={`w-2 h-2 rounded-full ${instance.health === 'healthy' ? 'bg-success animate-pulse' : instance.health === 'degraded' ? 'bg-warning animate-pulse-slow' : instance.health === 'failed' ? 'bg-danger' : 'bg-text-muted'}`}></span>
            <span className="text-sm font-medium">{healthLabels[instance.health]}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border">
        <button className="btn-ghost btn-sm flex-1" onClick={() => onTest?.()}>
          Test
        </button>
        <button className="btn-ghost btn-sm" onClick={() => window.open(instance.url, '_blank')} aria-label="Open instance">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14"></path>
          </svg>
        </button>
        <button className="btn-ghost btn-sm text-danger hover:bg-danger-soft" aria-label="Remove instance" onClick={() => onRemove?.()}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polyline points="3 6 5 6 21 6"></polyline>
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
          </svg>
        </button>
        <button className={`btn-ghost btn-sm ${instance.pinned ? 'text-warning' : ''}`} aria-label="Pin instance" onClick={() => onPin?.()}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 17v5"></path>
            <path d="M12 3v5"></path>
            <path d="M4 12h16"></path>
            <path d="M8 8v8"></path>
            <path d="M16 8v8"></path>
          </svg>
        </button>
      </div>
    </article>
  );
}
