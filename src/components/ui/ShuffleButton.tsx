/**
 * The shuffle control, in ONE place (live-test batch 2 Task 1c).
 *
 * The owner: "the shuffle icon needs to be replaced with one that is styled to
 * be typically recognized as this function based on what uses have come to know
 * from other apps with a player."
 *
 * Two things were working against recognition, both fixed here:
 *
 * 1. The glyph was drawn at strokeWidth 2 with 6px arrowheads. At the 18–24px
 *    the transport bar renders, the arrowheads vanished and it read as abstract
 *    crossing lines. The SHAPE itself was already the conventional shuffle
 *    (two tracks, two crossing arrows — what Spotify/Apple Music/YouTube Music
 *    all use); it was the WEIGHT that made it unreadable, so the weight is what
 *    changed.
 * 2. Neither surface labelled it. A visible text label is the one affordance
 *    that cannot be misread, whatever the user's familiarity with player icons,
 *    so the label is rendered rather than left to the tooltip.
 */
export function ShuffleButton({
  active,
  onToggle,
  size = 24,
  showLabel = true,
}: {
  active: boolean;
  onToggle: () => void;
  size?: number;
  showLabel?: boolean;
}) {
  return (
    <button
      type="button"
      className={`btn-ghost p-2 flex items-center gap-2 ${active ? 'text-accent' : ''}`}
      aria-label="Shuffle"
      aria-pressed={active}
      title={active ? 'Shuffle is on' : 'Shuffle is off'}
      onClick={onToggle}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        // 2.6 rather than 2: the arrowheads survive at transport-bar sizes.
        strokeWidth="2.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {/* Two tracks, the way every player draws it. */}
        <line x1="3" y1="6" x2="21" y2="6" />
        <line x1="3" y1="18" x2="21" y2="18" />
        {/* The crossing arrows, drawn as filled arrowheads so the direction
            survives a small render. */}
        <path d="M18 3 L21 6 L18 9" />
        <path d="M6 15 L3 18 L6 21" />
        <line x1="18" y1="3" x2="6" y2="15" strokeWidth="1.8" />
        <line x1="6" y1="9" x2="18" y2="21" strokeWidth="1.8" />
      </svg>
      {showLabel && <span className="text-sm">Shuffle</span>}
    </button>
  );
}
