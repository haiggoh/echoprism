import { clsx } from 'clsx';
import { PrismMark, PRISM_PALE_FILTER, PRISM_PALE_OPACITY, PRISM_VIEW_H, PRISM_VIEW_W } from './PrismLogo';

/**
 * PrismBadge — the in-app twin of the dock icon (design/brand/prism-icon.svg):
 * a thin brand-gradient edge around a dark panel holding the prism mark.
 * The dark panel is what keeps the teal/orange beams legible; on a solid
 * gradient fill they dissolve into their own hues. Edge ratio follows the
 * dock icon (28/1024), floored at 1.5px so it survives at 32px.
 *
 * The mark's SVG fills the WHOLE panel (its viewBox is widened around the
 * 120x64 drawing) and the beams are given enough reach to cross it, so they
 * run all the way to the gradient edge and are cut by the panel's rounded
 * clip, exactly like the dock icon. Drawing the mark at its own 120x64 box
 * left a visible gap between the beam ends and the edge.
 */
interface PrismBadgeProps {
  /** Badge box in px (width; height = width / aspect). */
  width?: number;
  /** 1 = square (sidebar), 2 = wide pill (header). */
  aspect?: 1 | 2;
  audioOnly?: boolean;
  className?: string;
}

export function PrismBadge({ width = 32, aspect = 1, audioOnly = false, className }: PrismBadgeProps) {
  const height = width / aspect;
  const edge = Math.max(1.5, (height * 28) / 1024);
  const radius = height * 0.225;
  const panelW = width - 2 * edge;
  const panelH = height - 2 * edge;

  // Mark width in px: as wide as fits, leaving the prism room vertically.
  const markW = Math.min(panelW * 0.82, panelH * 1.6);
  const unitsPerPx = PRISM_VIEW_W / markW;
  const vbW = panelW * unitsPerPx;
  const vbH = panelH * unitsPerPx;
  const vbX = -(vbW - PRISM_VIEW_W) / 2;
  const vbY = -(vbH - PRISM_VIEW_H) / 2;
  const reach = Math.ceil(Math.max(-vbX, -vbY)) + 2;

  return (
    <div
      className={clsx('flex-shrink-0 bg-gradient-to-br from-stream-video to-stream-audio', className)}
      style={{ width, height, padding: edge, borderRadius: radius }}
    >
      <div className="w-full h-full overflow-hidden bg-bg" style={{ borderRadius: radius - edge }}>
        <svg
          width={panelW}
          height={panelH}
          viewBox={`${vbX} ${vbY} ${vbW} ${vbH}`}
          fill="none"
          aria-hidden="true"
          className="block"
        >
          <PrismMark
            k={markW < 40 ? 1.3 : 1}
            reach={reach}
            videoOpacity={audioOnly ? PRISM_PALE_OPACITY : 1}
            videoFilter={audioOnly ? PRISM_PALE_FILTER : undefined}
          />
        </svg>
      </div>
    </div>
  );
}
