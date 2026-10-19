import { clsx } from 'clsx';
import { PrismLogo } from './PrismLogo';

/**
 * PrismBadge — the in-app twin of the dock icon (design/brand/prism-icon.svg):
 * a thin brand-gradient edge around a dark panel holding the prism mark.
 * The dark panel is what keeps the teal/orange beams legible; on a solid
 * gradient fill they dissolve into their own hues. Edge ratio follows the
 * dock icon (28/1024), floored at 1.5px so it survives at 32px.
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
  return (
    <div
      className={clsx('flex-shrink-0 bg-gradient-to-br from-stream-video to-stream-audio', className)}
      style={{ width, height, padding: edge, borderRadius: height * 0.225 }}
    >
      <div
        className="w-full h-full flex items-center justify-center bg-bg"
        style={{ borderRadius: height * 0.225 - edge }}
      >
        <PrismLogo size={Math.round(Math.min(width, height * 1.875) * 0.82)} audioOnly={audioOnly} />
      </div>
    </div>
  );
}
