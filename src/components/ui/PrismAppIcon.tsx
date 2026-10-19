import { useId } from 'react';
import { PrismMark, PRISM_PALE_FILTER, PRISM_PALE_OPACITY, PRISM_VIEW_H, PRISM_VIEW_W } from './PrismLogo';

/**
 * PrismAppIcon — THE app icon, in one place.
 *
 * The dock/app icon (design/brand/build-dock-icon.tsx renders this component
 * to design/brand/prism-icon.svg) and the in-app sidebar icon are the same
 * component, so they cannot drift apart. They did once: the sidebar had its
 * own badge layout (plain rounded rect, mark at 82% of the panel) while the
 * dock icon was redesigned (squircle, mark at 120%), and the two diverged.
 *
 * Layout is the native macOS icon grid, MEASURED from the system's own icons
 * (design/brand/measure-native-icon.py, macOS 26): the body is a superellipse
 * ("squircle") with quadrant radius 0.347 of its side and exponent 3.3, which
 * matches the native mask to within 0.16% of its pixels. Everything is
 * expressed as a fraction of the body, so it scales to any size.
 *
 * `margin` adds the transparent canvas margin the OS expects around an app
 * icon (100/824 of the body, so the body fills 80.5% of a 1024 canvas). The
 * dock build uses it; in-app use passes `margin={false}` and gets the body
 * edge to edge.
 */

interface PrismAppIconProps {
  /** Rendered size in px of the whole canvas (body + margin if any). */
  size: number;
  /** Include the OS app-icon canvas margin (the dock build does). */
  margin?: boolean;
  audioOnly?: boolean;
  /** Display size the fringes are tuned for; defaults to the body size.
   *  The 1024px dock canvas is shown at ~128pt, so the build passes that. */
  displayPx?: number;
  className?: string;
}

const MARGIN_RATIO = 100 / 824;
const CORNER_RATIO = 286 / 824;
const CORNER_EXP = 3.3;
/** Gradient edge, as a fraction of the body: 22px on the 824px dock body. */
const EDGE_RATIO = 22 / 824;
/** Mark width as a fraction of the body (prism ~43% of the body). */
const MARK_RATIO = 1.2;

/** Superellipse-cornered square at (off, off) with side `size`. */
export function squirclePath(off: number, size: number, steps = 24): string {
  const R = size * CORNER_RATIO;
  const n = CORNER_EXP;
  const [x0, y0, x1, y1] = [off, off, off + size, off + size];
  const quad = (cx: number, cy: number, sx: number, sy: number) =>
    Array.from({ length: steps + 1 }, (_, i) => {
      const t = (Math.PI / 2) * (i / steps);
      return [cx + sx * R * Math.cos(t) ** (2 / n), cy + sy * R * Math.sin(t) ** (2 / n)];
    });
  const pts = [
    ...quad(x1 - R, y0 + R, 1, -1).reverse(),
    ...quad(x1 - R, y1 - R, 1, 1),
    ...quad(x0 + R, y1 - R, -1, 1).reverse(),
    ...quad(x0 + R, y0 + R, -1, -1),
  ];
  return 'M ' + pts.map(([x, y]) => `${x.toFixed(2)} ${y.toFixed(2)}`).join(' L ') + ' Z';
}

export function PrismAppIcon({
  size,
  margin = false,
  audioOnly = false,
  displayPx,
  className,
}: PrismAppIconProps) {
  const uid = useId().replace(/:/g, '');
  // Work in a fixed 1024 canvas (body 824 with margin, 1024 without) and let
  // the viewBox scale it to `size`: one geometry for every size.
  const C = 1024;
  const off = margin ? C * (MARGIN_RATIO / (1 + 2 * MARGIN_RATIO)) : 0;
  const body = C - 2 * off;
  // The edge never drops below ~1.25 CSS px at small in-app sizes.
  const bodyPx = (size * body) / C;
  const edge = Math.max(body * EDGE_RATIO, (1.25 * C) / size);
  const outer = squirclePath(off, body);
  const inner = squirclePath(off + edge, body - 2 * edge);

  const markW = body * MARK_RATIO;
  const markH = (markW * PRISM_VIEW_H) / PRISM_VIEW_W;
  const reach = Math.max(0, Math.ceil(((body - 2 * edge - markW) / 2) * (PRISM_VIEW_W / markW))) + 4;
  const markPx = ((displayPx ?? bodyPx) * MARK_RATIO);

  // Theme variables; the static dock build substitutes literal colours.
  const video = 'var(--color-stream-video)';
  const audio = 'var(--color-stream-audio)';
  const panel = 'var(--color-bg)';
  const ids = { brand: `${uid}-brand`, clip: `${uid}-panel` };

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${C} ${C}`}
      className={className}
      aria-hidden="true"
      data-testid="prism-app-icon"
    >
      <defs>
        <linearGradient id={ids.brand} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={video} />
          <stop offset="100%" stopColor={audio} />
        </linearGradient>
        <clipPath id={ids.clip}>
          <path d={inner} />
        </clipPath>
      </defs>
      <path d={outer} fill={`url(#${ids.brand})`} />
      <path d={inner} fill={panel} />
      <g clipPath={`url(#${ids.clip})`}>
        <svg
          x={(C - markW) / 2}
          y={(C - markH) / 2}
          width={markW}
          height={markH}
          viewBox={`0 0 ${PRISM_VIEW_W} ${PRISM_VIEW_H}`}
          overflow="visible"
        >
          <PrismMark
            reach={reach}
            pxWidth={markPx}
            k={markPx < 40 ? 1.3 : 1}
            videoOpacity={audioOnly ? PRISM_PALE_OPACITY : 1}
            videoFilter={audioOnly ? PRISM_PALE_FILTER : undefined}
          />
        </svg>
      </g>
    </svg>
  );
}
