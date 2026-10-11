interface InstanceHealthGridProps {
  instances: Array<{
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
  }>;
}

export function InstanceHealthGrid({ instances }: InstanceHealthGridProps) {
  return (
    <div className="space-y-4">
      <h3 className="font-semibold text-text">Instance Health</h3>
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {instances.map((instance) => (
          <div key={instance.id} className="bg-surface border border-border rounded-xl p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap gap-1 mb-2">
                  <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${instance.type === 'invidious' ? 'bg-blue-500/20 text-blue-400' : 'bg-purple-500/20 text-purple-400'}`}>
                    {instance.type.toUpperCase()}
                  </span>
                  {instance.supports_sabr && (
                    <span className="px-2 py-0.5 text-xs font-medium bg-emerald-500/20 text-emerald-400">
                      SABR
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
              <div className="flex items-center gap-2">
                <span className={`flex items-center gap-2 ${instance.health === 'healthy' ? 'text-success' : instance.health === 'degraded' ? 'text-warning' : instance.health === 'failed' ? 'text-danger' : 'text-text-muted'}`}>
                  <span className={`w-2 h-2 rounded-full ${instance.health === 'healthy' ? 'bg-success animate-pulse' : instance.health === 'degraded' ? 'bg-warning animate-pulse-slow' : instance.health === 'failed' ? 'bg-danger' : 'bg-text-muted'}`}></span>
                  <span className="text-sm font-medium capitalize">{instance.health}</span>
                </span>
              </div>
            </div>
            <div className="mt-4 pt-4 border-t border-border flex items-center gap-2">
              {instance.latency_ms && (
                <div className="flex items-center gap-1 text-sm text-text-muted">
                  <span>Latency:</span>
                  <span className="font-mono">{instance.latency_ms}ms</span>
                </div>
              )}
              {instance.last_checked && (
                <div className="text-sm text-text-muted">
                  Last checked: {new Date(instance.last_checked).toLocaleString()}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
