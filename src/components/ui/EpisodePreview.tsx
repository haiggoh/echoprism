import type { StoryboardSpec } from '../../types';

/**
 * Phase E: the sprite overlay for a hovered card — the current frame drawn
 * via the classic background-position technique. aria-hidden + pointer-events
 * none: the preview is an ENHANCEMENT (playing is the action; the card's
 * click semantics are untouched), and screen readers skip it entirely.
 */
export function EpisodePreview({ spec, frameIndex }: { spec: StoryboardSpec; frameIndex: number }) {
  const cols = Math.max(1, spec.frames_per_page_x);
  const rows = Math.max(1, spec.frames_per_page_y);
  const perPage = cols * rows;
  const frames = Math.min(perPage, spec.total_count || perPage);
  const idx = frames > 0 ? frameIndex % frames : 0;
  const col = idx % cols;
  const row = Math.floor(idx / cols);

  return (
    <div
      aria-hidden="true"
      data-testid="episode-preview"
      className="absolute inset-0 z-10 pointer-events-none rounded-lg overflow-hidden"
      style={{
        backgroundImage: `url(${spec.urls[0]})`,
        backgroundSize: `${cols * 100}% ${rows * 100}%`,
        backgroundPosition:
          cols > 1 ? `${(col / (cols - 1)) * 100}% ${(row / (rows - 1)) * 100}%` : 'center',
        backgroundRepeat: 'no-repeat',
        backgroundColor: 'var(--color-bg)',
      }}
    />
  );
}
