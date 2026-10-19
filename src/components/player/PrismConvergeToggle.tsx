import { AnimatePresence } from 'framer-motion';
import {
  PRISM_TRIANGLE,
  PRISM_AUDIO_BEAM,
  PRISM_VIDEO_BEAM,
  PRISM_EXIT_BEAM,
  PRISM_MEET,
  PRISM_AUDIO_START,
  PRISM_VIDEO_START,
  PRISM_EXIT_END,
  PRISM_BEAM_WIDTH,
  PRISM_EXIT_WIDTH,
  PRISM_OUTLINE_WIDTH,
  PRISM_PALE_OPACITY,
  PRISM_PALE_FILTER,
  PrismWhiteMerge,
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
        {/* Prism triangle (shared geometry with PrismLogo) */}
        <polygon
          points={PRISM_TRIANGLE}
          fill="rgba(255,255,255,0.04)"
          stroke="rgba(255,255,255,0.9)"
          strokeWidth={PRISM_OUTLINE_WIDTH}
          strokeLinejoin="round"
        />

        {/* Audio stream (teal): approaches, refracts on entry, meets video on the right face */}
        <path
          data-testid="toggle-audio-beam"
          d={PRISM_AUDIO_BEAM}
          stroke="var(--color-stream-audio)"
          strokeWidth={PRISM_BEAM_WIDTH}
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
          strokeWidth={PRISM_BEAM_WIDTH}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          opacity={videoPale ? PRISM_PALE_OPACITY : 1}
          style={{ filter: videoPale ? PRISM_PALE_FILTER : undefined, transition: BEAM_TRANSITION }}
        />

        {/* Colours fade to white where the streams merge inside the glass;
            full white only in unified mode, where both streams carry */}
        <PrismWhiteMerge opacity={unified ? 1 : 0.25} />

        {/* Combined stream: the white beam refracting out of the right face —
            fully lit only in unified mode */}
        <path
          data-testid="toggle-combined-beam"
          d={PRISM_EXIT_BEAM}
          stroke="#FFFFFF"
          strokeWidth={PRISM_EXIT_WIDTH}
          strokeLinecap="round"
          fill="none"
          opacity={unified ? 1 : 0.25}
          style={{ transition: BEAM_TRANSITION }}
        />

        {/* Convergence pulse at the meeting point */}
        <AnimatePresence mode="wait">
          {unified && (
            <circle cx={PRISM_MEET.x} cy={PRISM_MEET.y} r="8" fill="var(--color-stream-unified)" opacity={0.3} className="convergence-pulse">
              <animate attributeName="r" from="6" to="14" dur="800ms" repeatCount="indefinite" begin="0s" />
              <animate attributeName="opacity" from="0.5" to="0" dur="800ms" repeatCount="indefinite" begin="0s" />
            </circle>
          )}
        </AnimatePresence>

        {/* Mode indicator dots: stream entries + combined-stream end */}
        <g className="mode-indicators">
          <circle
            cx={PRISM_AUDIO_START.x + 2} cy={PRISM_AUDIO_START.y} r="3.5"
            fill={mode === 'audio' || unified ? 'var(--color-stream-audio)' : 'var(--color-border)'}
            className="mode-indicator"
          />
          <circle
            cx={PRISM_VIDEO_START.x + 2} cy={PRISM_VIDEO_START.y} r="3.5"
            fill={mode === 'video' || unified ? 'var(--color-stream-video)' : 'var(--color-border)'}
            className="mode-indicator"
          />
          <circle
            cx={PRISM_EXIT_END.x} cy={PRISM_EXIT_END.y} r="3.5"
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
