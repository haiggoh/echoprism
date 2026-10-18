/**
 * PrismLogo — the EchoPrism brand mark (redesigned 2026-10-18 per owner spec).
 *
 * Geometry: the audio (teal) and video (orange) streams enter straight from
 * the left, bend once and CROSS inside the triangle toward its right side
 * (not the middle), then leave together in parallel on the right, joined by
 * a thick white beam — the combined stream that carries everything.
 *
 * Colors come from the CSS variables (--color-stream-audio/-video) so the
 * mark can never drift from the theme. In audio-only mode the video stream
 * fades to a barely-visible pale orange; it returns at full saturation when
 * audio-only is off.
 */
interface PrismLogoProps {
  /** Rendered width in px; height follows the 120:64 viewBox ratio. */
  size?: number;
  /** Audio-only: dim the video (orange) stream to a pale whisper. */
  audioOnly?: boolean;
  className?: string;
}

// Geometry lives in module constants (not component state) so the interactive
// PrismConvergeToggle can render the SAME diagram — one source of truth for
// the mark, whether static or mode-driven.
export const PRISM_VIEW_W = 120;
export const PRISM_VIEW_H = 64;

/** Apex top-center, base bottom: streams enter through the left edge. */
export const PRISM_TRIANGLE = '60,8 104,56 16,56';

// Beam polylines: entry (straight) -> kink -> parallel exit. The two middle
// segments cross at ~(72, 32) — inside the triangle, ~69% toward its right
// (geometry verified against the triangle edges: both kinks and the crossing
// sit inside; both exits cross the right edge in parallel 8 units apart).
export const PRISM_AUDIO_BEAM = 'M 4 26 L 66 26 L 76 36 L 116 36';
export const PRISM_VIDEO_BEAM = 'M 4 38 L 66 38 L 76 28 L 116 28';

/** Audio-only pale state (D-spec): "very pale desaturated orange, barely
 *  visible" — desaturate + lift rather than just dim, so it reads pale on
 *  dark panels, not dark brown. */
export const PRISM_PALE_OPACITY = 0.35;
export const PRISM_PALE_FILTER = 'saturate(0.35) brightness(1.35)';

export function PrismLogo({ size = 24, audioOnly = false, className = '' }: PrismLogoProps) {
  const height = Math.round((size * PRISM_VIEW_H) / PRISM_VIEW_W);
  return (
    <svg
      width={size}
      height={height}
      viewBox={`0 0 ${PRISM_VIEW_W} ${PRISM_VIEW_H}`}
      fill="none"
      className={className}
      aria-hidden="true"
    >
      {/* Prism triangle — brighter, thicker outline than the old mark */}
      <polygon
        points={PRISM_TRIANGLE}
        stroke="rgba(255,255,255,0.88)"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />

      {/* Audio stream (teal): straight in, crosses, exits parallel */}
      <path
        data-testid="prism-audio-beam"
        d={PRISM_AUDIO_BEAM}
        stroke="var(--color-stream-audio)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={1}
      />

      {/* Video stream (orange): pales to barely-visible when audio-only is on */}
      <path
        data-testid="prism-video-beam"
        d={PRISM_VIDEO_BEAM}
        stroke="var(--color-stream-video)"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={audioOnly ? PRISM_PALE_OPACITY : 1}
        style={{
          filter: audioOnly ? PRISM_PALE_FILTER : undefined,
          transition: 'opacity 300ms ease, filter 300ms ease',
        }}
      />

      {/* Combined stream: thick white beam bridging the parallel exits —
          wide enough to overlap both colored beams, so the three read as
          one fused cable (review finding: a narrower bar floated between
          them, connecting to neither) */}
      <line
        x1="84"
        y1="32"
        x2="114"
        y2="32"
        stroke="#FFFFFF"
        strokeWidth="10.5"
        strokeLinecap="round"
      />
    </svg>
  );
}
