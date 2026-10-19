import { AnimatePresence } from 'framer-motion';
import {
  PRISM_MEET,
  PRISM_PALE_OPACITY,
  PRISM_PALE_FILTER,
  PrismMark,
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
        {/* The mark itself, one geometry shared with PrismLogo. The beams
            run to the edge (no end dots): streams continue to infinity. */}
        <PrismMark
          pxWidth={width}
          audioOpacity={audioPale ? PRISM_PALE_OPACITY : 1}
          audioFilter={audioPale ? PRISM_PALE_FILTER : undefined}
          videoOpacity={videoPale ? PRISM_PALE_OPACITY : 1}
          videoFilter={videoPale ? PRISM_PALE_FILTER : undefined}
          // The combined stream is fully lit only in unified mode
          combinedOpacity={unified ? 1 : 0.25}
          transition={BEAM_TRANSITION}
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

    </div>
  );
}
