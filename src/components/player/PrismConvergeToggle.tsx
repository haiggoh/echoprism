import { useState, useEffect, useRef } from 'react';
import { AnimatePresence } from 'framer-motion';

interface PrismConvergeToggleProps {
  mode: 'unified' | 'audio' | 'video';
  onModeChange: (mode: 'unified' | 'audio' | 'video') => void;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
}

export function PrismConvergeToggle({
  mode,
  onModeChange,
  size = 'md',
  disabled = false
}: PrismConvergeToggleProps) {
  const [isConverging, setIsConverging] = useState(false);
  const svgRef = useRef<SVGSVGElement>(null);

  const sizeConfig = {
    sm: { width: 80, height: 40, beamStroke: 1.5, prismSize: 20 },
    md: { width: 120, height: 60, beamStroke: 2, prismSize: 30 },
    lg: { width: 160, height: 80, beamStroke: 2.5, prismSize: 40 },
  };

  const config = sizeConfig[size];

  // Trigger convergence animation on mode change
  useEffect(() => {
    setIsConverging(true);
    const timer = setTimeout(() => setIsConverging(false), 800);
    return () => clearTimeout(timer);
  }, [mode]);

  const beamPath = (x1: number, y1: number, x2: number, y2: number, curve: number) => {
    return `M ${x1} ${y1} Q ${(x1 + x2) / 2} ${curve} ${x2} ${y2}`;
  };

  return (
    <div className={`relative inline-flex items-center justify-center ${isConverging ? 'converging' : ''}`} role="group" aria-label="Format toggle">
      <svg 
        ref={svgRef}
        width={config.width} 
        height={config.height} 
        viewBox={`0 0 ${config.width} ${config.height}`}
        className="block"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="beam-audio-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#FF8C42" />
            <stop offset="100%" stopColor="#FF7020" />
          </linearGradient>
          <linearGradient id="beam-video-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#00D4C8" />
            <stop offset="100%" stopColor="#00B8AC" />
          </linearGradient>
          <linearGradient id="beam-unified-gradient" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#10F0A8" />
            <stop offset="100%" stopColor="#00D890" />
          </linearGradient>
        </defs>

        {/* Prism triangle */}
        <polygon
          points={`${config.width / 2},${config.prismSize / 2} ${config.width / 2 - config.prismSize / 2},${config.height - config.prismSize / 2} ${config.width / 2 + config.prismSize / 2},${config.height - config.prismSize / 2}`}
          fill="none"
          stroke="var(--color-border)"
          strokeWidth="1.5"
          className="prism-shape"
        />

        {/* Audio beam (top-left to prism center) */}
        <path
          d={beamPath(
            config.prismSize / 2, 
            config.height / 2 - config.prismSize / 4,
            config.width / 2 - config.prismSize / 4, 
            config.height / 2,
            config.height / 2 - config.prismSize / 2
          )}
          stroke="url(#beam-audio-gradient)"
          strokeWidth={config.beamStroke}
          fill="none"
          strokeLinecap="round"
          className={`beam-audio ${mode === 'audio' || mode === 'unified' ? 'beam-visible' : 'beam-dimmed'}`}
          style={{
            strokeDasharray: 200,
            strokeDashoffset: mode === 'audio' || mode === 'unified' ? 0 : 200,
            transition: 'stroke-dashoffset 400ms cubic-bezier(0.68, -0.55, 0.265, 1.55)',
          }}
        />

        {/* Video beam (bottom-left to prism center) */}
        <path
          d={beamPath(
            config.prismSize / 2, 
            config.height / 2 + config.prismSize / 4,
            config.width / 2 - config.prismSize / 4, 
            config.height / 2,
            config.height / 2 + config.prismSize / 2
          )}
          stroke="url(#beam-video-gradient)"
          strokeWidth={config.beamStroke}
          fill="none"
          strokeLinecap="round"
          className={`beam-video ${mode === 'video' || mode === 'unified' ? 'beam-visible' : 'beam-dimmed'}`}
          style={{
            strokeDasharray: 200,
            strokeDashoffset: mode === 'video' || mode === 'unified' ? 0 : 200,
            transition: 'stroke-dashoffset 400ms cubic-bezier(0.68, -0.55, 0.265, 1.55)',
          }}
        />

        {/* Unified beam (prism center to right) */}
        <line
          x1={config.width / 2}
          y1={config.height / 2}
          x2={config.width - config.prismSize / 2}
          y2={config.height / 2}
          stroke="url(#beam-unified-gradient)"
          strokeWidth={config.beamStroke + 0.5}
          strokeLinecap="round"
          className={`beam-unified ${mode === 'unified' ? 'beam-visible' : 'beam-dimmed'}`}
          style={{
            strokeDasharray: 200,
            strokeDashoffset: mode === 'unified' ? 0 : 200,
            transition: 'stroke-dashoffset 400ms cubic-bezier(0.68, -0.55, 0.265, 1.55) 200ms',
          }}
        />

        {/* Convergence pulse at center */}
        <AnimatePresence mode="wait">
          {mode === 'unified' && (
            <circle
              cx={config.width / 2}
              cy={config.height / 2}
              r={config.prismSize / 3}
              fill="var(--color-stream-unified)"
              opacity={0.3}
              className="convergence-pulse"
            >
              <animate
                attributeName="r"
                from={config.prismSize / 4}
                to={config.prismSize / 2}
                dur="800ms"
                repeatCount="indefinite"
                begin="0s"
              />
              <animate
                attributeName="opacity"
                from="0.5"
                to="0"
                dur="800ms"
                repeatCount="indefinite"
                begin="0s"
              />
            </circle>
          )}
        </AnimatePresence>

        {/* Mode indicator dots */}
        <g className="mode-indicators">
          {/* Audio indicator */}
          <circle
            cx={config.prismSize / 2}
            cy={config.height / 2 - config.prismSize / 4}
            r={4}
            fill={mode === 'audio' || mode === 'unified' ? 'var(--color-stream-audio)' : 'var(--color-border)'}
            className="mode-indicator"
          />
          {/* Video indicator */}
          <circle
            cx={config.prismSize / 2}
            cy={config.height / 2 + config.prismSize / 4}
            r={4}
            fill={mode === 'video' || mode === 'unified' ? 'var(--color-stream-video)' : 'var(--color-border)'}
            className="mode-indicator"
          />
          {/* Unified indicator */}
          <circle
            cx={config.width - config.prismSize / 2}
            cy={config.height / 2}
            r={4}
            fill={mode === 'unified' ? 'var(--color-stream-unified)' : 'var(--color-border)'}
            className="mode-indicator"
          />
        </g>
      </svg>

      {/* Hidden radio buttons for accessibility */}
      <div className="sr-only" role="radiogroup" aria-label="Playback format">
        {['unified', 'audio', 'video'].map((m) => (
          <label key={m} className="sr-only">
            <input
              type="radio"
              name="format-toggle"
              value={m}
              checked={mode === m}
              onChange={() => onModeChange(m as any)}
              disabled={disabled}
            />
            <span>{m.charAt(0).toUpperCase() + m.slice(1)}</span>
          </label>
        ))}
      </div>

      <style>{`
        .beam-visible {
          opacity: 1;
        }
        .beam-dimmed {
          opacity: 0.2;
        }
        .beam-audio, .beam-video, .beam-unified {
          transition: stroke-dashoffset 400ms cubic-bezier(0.68, -0.55, 0.265, 1.55);
        }
        .beam-unified {
          transition-delay: 200ms;
        }
        .convergence-pulse {
          animation: pulse-ring 800ms ease-out infinite;
        }
        @keyframes pulse-ring {
          0% { r: calc(var(--prism-size) / 4); opacity: 0.5; }
          100% { r: calc(var(--prism-size) / 2); opacity: 0; }
        }
        .mode-indicator {
          transition: fill 200ms ease;
        }
      `}
      </style>
    </div>
  );
}
