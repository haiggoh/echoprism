import { AnimatePresence } from 'framer-motion';
import {
  PRISM_TRIANGLE,
  PRISM_AUDIO_BEAM,
  PRISM_VIDEO_BEAM,
  PRISM_PALE_OPACITY,
  PRISM_PALE_FILTER,
} from '../ui/PrismLogo';

interface PrismConvergeToggleProps {
  mode: 'unified' | 'audio' | 'video';
  onModeChange: (mode: 'unified' | 'audio' | 'video') => void;
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  loading?: boolean;
  /** True while audio-only playback is active: the video stream pales to
   *  barely-visible (D-spec 2026-10-18), independent of this toggle's mode. */
  audioOnly?: boolean;
}

// The toggle renders the SAME diagram as the static PrismLogo — one mark, one
// geometry — scaled by the wrapper. Aspect ratio matches the 120x64 viewBox.
const sizeConfig = {
  sm: { width: 90, height: 48 },
  md: { width: 120, height: 64 },
  lg: { width: 150, height: 80 },
};

// Stream state per mode: inactive stream pales to barely-visible.
const BEAM_TRANSITION = 'opacity 300ms ease, filter 300ms ease';

export function PrismConvergeToggle({
  mode,
  onModeChange,
  size = 'md',
  disabled = false,
  audioOnly = false,
}: PrismConvergeToggleProps) {
  const { width, height } = sizeConfig[size];
  const unified = mode === 'unified';
  const videoPale = audioOnly || mode === 'audio';
  const audioPale = mode === 'video';

  return (
    <div className="relative inline-flex items-center justify-center" role="group" aria-label="Format toggle">
      <svg width={width} height={height} viewBox="0 0 120 64" className="block" aria-hidden="true">
        {/* Prism triangle — brighter, thicker outline than the pre-redesign mark */}
        <polygon
          points={PRISM_TRIANGLE}
          fill="none"
          stroke="rgba(255,255,255,0.88)"
          strokeWidth="2.5"
          strokeLinejoin="round"
        />

        {/* Audio stream (teal): straight in, crosses inside the prism, exits parallel */}
        <path
          data-testid="toggle-audio-beam"
          d={PRISM_AUDIO_BEAM}
          stroke="var(--color-stream-audio)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          opacity={audioPale ? PRISM_PALE_OPACITY : 1}
          style={{ filter: audioPale ? PRISM_PALE_FILTER : undefined, transition: BEAM_TRANSITION }}
        />

        {/* Video stream (orange): pales when audio-only is on */}
        <path
          data-testid="toggle-video-beam"
          d={PRISM_VIDEO_BEAM}
          stroke="var(--color-stream-video)"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          opacity={videoPale ? PRISM_PALE_OPACITY : 1}
          style={{ filter: videoPale ? PRISM_PALE_FILTER : undefined, transition: BEAM_TRANSITION }}
        />

        {/* Combined stream: the thick white beam bridging the parallel exits —
            fully lit only in unified mode, where both streams carry */}
        <line
          data-testid="toggle-combined-beam"
          x1="84"
          y1="32"
          x2="114"
          y2="32"
          stroke="#FFFFFF"
          strokeWidth="10.5"
          strokeLinecap="round"
          opacity={unified ? 1 : 0.25}
          style={{ transition: BEAM_TRANSITION }}
        />

        {/* Convergence pulse at the crossing point */}
        <AnimatePresence mode="wait">
          {unified && (
            <circle cx="72" cy="32" r="8" fill="var(--color-stream-unified)" opacity={0.3} className="convergence-pulse">
              <animate attributeName="r" from="6" to="14" dur="800ms" repeatCount="indefinite" begin="0s" />
              <animate attributeName="opacity" from="0.5" to="0" dur="800ms" repeatCount="indefinite" begin="0s" />
            </circle>
          )}
        </AnimatePresence>

        {/* Mode indicator dots: stream entries + combined-stream end */}
        <g className="mode-indicators">
          <circle
            cx="6" cy="26" r="3.5"
            fill={mode === 'audio' || unified ? 'var(--color-stream-audio)' : 'var(--color-border)'}
            className="mode-indicator"
          />
          <circle
            cx="6" cy="38" r="3.5"
            fill={mode === 'video' || unified ? 'var(--color-stream-video)' : 'var(--color-border)'}
            className="mode-indicator"
          />
          <circle
            cx="116" cy="32" r="3.5"
            fill={unified ? 'var(--color-stream-unified)' : 'var(--color-border)'}
            className="mode-indicator"
          />
        </g>
      </svg>

      {/* Hidden radio buttons for accessibility */}
      <div className="sr-only" role="radiogroup" aria-label="Playback format">
        {(['unified', 'audio', 'video'] as const).map((m) => (
          <label key={m} className="sr-only">
            <input
              type="radio"
              name="format-toggle"
              value={m}
              checked={mode === m}
              onChange={() => onModeChange(m)}
              disabled={disabled}
            />
            <span>{m.charAt(0).toUpperCase() + m.slice(1)}</span>
          </label>
        ))}
      </div>

      <style>{`
        .mode-indicator {
          transition: fill 200ms ease;
        }
      `}
      </style>
    </div>
  );
}
