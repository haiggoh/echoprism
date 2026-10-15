interface InstanceHealthIndicatorProps {
  health: 'healthy' | 'degraded' | 'failed' | 'unknown';
  latencyMs?: number;
  className?: string;
}

export function InstanceHealthIndicator({ health, latencyMs, className = '' }: InstanceHealthIndicatorProps) {
  const healthConfig: Record<string, { color: string; label: string; pulse: boolean; slow?: boolean }> = {
    healthy: { color: 'text-success', label: 'Healthy', pulse: true },
    degraded: { color: 'text-warning', label: 'Degraded', pulse: true, slow: true },
    failed: { color: 'text-danger', label: 'Failed', pulse: false },
    unknown: { color: 'text-text-muted', label: 'Unknown', pulse: false },
  };

  const config = healthConfig[health];

  return (
    <span className={`inline-flex items-center gap-1.5 ${className}`}>
      <span className={`w-2 h-2 rounded-full ${config.pulse ? (config.slow ? 'animate-pulse-slow' : 'animate-pulse') : ''} ${config.color.replace('text-', 'bg-')}`}></span>
      <span className={`text-sm font-medium ${config.color}`}>{config.label}</span>
      {latencyMs !== undefined && (
        <span className="text-sm text-text-muted font-mono">{latencyMs}ms</span>
      )}
    </span>
  );
}
