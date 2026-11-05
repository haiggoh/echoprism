/**
 * The ONE filled play triangle (round 6 Task 4, echoprism-play-triangle-centre).
 *
 * Optical centring: in the 24x24 viewBox the old points="5 3 19 12 5 21 5 3"
 * are bounding-box centred at x=12 but their CENTROID sits at
 * (5+19+5)/3 ≈ 9.67, so the triangle reads left-shifted. These points put the
 * centroid at (7+21+7)/3 ≈ 11.67 — optically centred at 12 — at the same size.
 */
export function PlayIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <polygon points="7 3 21 12 7 21" />
    </svg>
  );
}
