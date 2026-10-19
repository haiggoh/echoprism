import { useId } from 'react';

/**
 * PrismLogo — the EchoPrism brand mark (refraction redesign 2026-10-19).
 *
 * Geometry is a reverse prism, traced with Snell's law (n = 1.5) rather than
 * hand-placed kinks: the audio (teal) and video (orange) streams arrive from
 * the left at different angles, each bends TOWARD the face normal as it
 * enters the glass, both converge on one point of the right face, and a
 * single white beam (the combined stream) bends AWAY from the normal as it
 * leaves. Inside the glass each colour fades to white as the beams meet —
 * light mixes additively, so overlapping streams read as white.
 *
 * Owner spec: narrower prism than the 2026-10-18 mark (apex ~54 degrees,
 * close to the original), entry/exit angles that visibly refract.
 * Generator: design/brand/prism-geometry.py --apex 54 --h 48 --aa 6 --av -26
 * --ua 0.32 (rerun it to change the mark; paste its output below).
 *
 * Colors come from the CSS variables (--color-stream-audio/-video) so the
 * mark can never drift from the theme. In audio-only mode the video stream
 * fades to a barely-visible pale orange.
 */
interface PrismLogoProps {
  /** Rendered width in px; height follows the 120:64 viewBox ratio. */
  size?: number;
  /** Audio-only: dim the video (orange) stream to a pale whisper. */
  audioOnly?: boolean;
  className?: string;
}

// Geometry lives in module constants so PrismConvergeToggle and the dock
// icon SVG render the SAME diagram — one source of truth for the mark.
export const PRISM_VIEW_W = 120;
export const PRISM_VIEW_H = 64;

/** Apex top-center (apex angle ~54 degrees), base bottom. */
export const PRISM_TRIANGLE = '58,8 82.5,56 33.5,56';

/** Where both streams meet on the right face and the white beam leaves. */
export const PRISM_MEET = { x: 67.9, y: 27.5 };
/** Entry points on the left face (where each stream starts refracting). */
export const PRISM_AUDIO_ENTRY = { x: 50.2, y: 23.4 };
export const PRISM_VIDEO_ENTRY = { x: 47.1, y: 29.4 };

/** Each stream: straight approach -> refracted path inside the glass -> meet. */
export const PRISM_AUDIO_BEAM = 'M 4 18.5 L 50.2 23.4 L 67.9 27.5';
export const PRISM_VIDEO_BEAM = 'M 4 50.4 L 47.1 29.4 L 67.9 27.5';
/** Combined white stream, refracted away from the right face's normal. */
export const PRISM_EXIT_BEAM = 'M 67.9 27.5 L 116 48.5';

/** Endpoints for the mode indicators drawn by the toggle. */
export const PRISM_AUDIO_START = { x: 4, y: 18.5 };
export const PRISM_VIDEO_START = { x: 4, y: 50.4 };
export const PRISM_EXIT_END = { x: 116, y: 48.5 };

export const PRISM_BEAM_WIDTH = 2.6;
export const PRISM_EXIT_WIDTH = 4.2;
export const PRISM_OUTLINE_WIDTH = 2.2;

/** Audio-only pale state (D-spec): "very pale desaturated orange, barely
 *  visible" — desaturate + lift rather than just dim, so it reads pale on
 *  dark panels, not dark brown. */
export const PRISM_PALE_OPACITY = 0.35;
export const PRISM_PALE_FILTER = 'saturate(0.35) brightness(1.35)';

/**
 * The colour-to-white fade inside the glass, drawn OVER each stream's glass
 * segment: transparent at the entry, white at the meeting point. Kept as an
 * overlay (not a gradient on the beam itself) so each beam stays one path
 * whose opacity can pale independently.
 */
export function PrismWhiteMerge({ opacity = 1, width = PRISM_BEAM_WIDTH }: { opacity?: number; width?: number }) {
  const uid = useId().replace(/:/g, '');
  const segs = [
    { id: `${uid}-a`, from: PRISM_AUDIO_ENTRY },
    { id: `${uid}-v`, from: PRISM_VIDEO_ENTRY },
  ];
  return (
    <g opacity={opacity} style={{ transition: 'opacity 300ms ease' }}>
      <defs>
        {segs.map(({ id, from }) => (
          <linearGradient
            key={id}
            id={id}
            gradientUnits="userSpaceOnUse"
            x1={from.x}
            y1={from.y}
            x2={PRISM_MEET.x}
            y2={PRISM_MEET.y}
          >
            <stop offset="0" stopColor="#FFFFFF" stopOpacity="0" />
            <stop offset="1" stopColor="#FFFFFF" stopOpacity="1" />
          </linearGradient>
        ))}
      </defs>
      {segs.map(({ id, from }) => (
        <line
          key={id}
          x1={from.x}
          y1={from.y}
          x2={PRISM_MEET.x}
          y2={PRISM_MEET.y}
          stroke={`url(#${id})`}
          strokeWidth={width}
          strokeLinecap="round"
        />
      ))}
    </g>
  );
}

export function PrismLogo({ size = 24, audioOnly = false, className = '' }: PrismLogoProps) {
  const height = Math.round((size * PRISM_VIEW_H) / PRISM_VIEW_W);
  // Small renders (header/sidebar) get slightly heavier strokes so the
  // beams survive at ~26px wide.
  const k = size < 40 ? 1.3 : 1;
  return (
    <svg
      width={size}
      height={height}
      viewBox={`0 0 ${PRISM_VIEW_W} ${PRISM_VIEW_H}`}
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <polygon
        points={PRISM_TRIANGLE}
        fill="rgba(255,255,255,0.04)"
        stroke="rgba(255,255,255,0.9)"
        strokeWidth={PRISM_OUTLINE_WIDTH * k}
        strokeLinejoin="round"
      />

      <path
        data-testid="prism-audio-beam"
        d={PRISM_AUDIO_BEAM}
        stroke="var(--color-stream-audio)"
        strokeWidth={PRISM_BEAM_WIDTH * k}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={1}
      />

      <path
        data-testid="prism-video-beam"
        d={PRISM_VIDEO_BEAM}
        stroke="var(--color-stream-video)"
        strokeWidth={PRISM_BEAM_WIDTH * k}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={audioOnly ? PRISM_PALE_OPACITY : 1}
        style={{
          filter: audioOnly ? PRISM_PALE_FILTER : undefined,
          transition: 'opacity 300ms ease, filter 300ms ease',
        }}
      />

      <PrismWhiteMerge width={PRISM_BEAM_WIDTH * k} />

      <path
        data-testid="prism-exit-beam"
        d={PRISM_EXIT_BEAM}
        stroke="#FFFFFF"
        strokeWidth={PRISM_EXIT_WIDTH * k}
        strokeLinecap="round"
      />
    </svg>
  );
}
