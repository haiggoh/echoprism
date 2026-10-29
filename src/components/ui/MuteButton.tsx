/**
 * The mute toggle, in ONE place (live-test batch 2, Task 1).
 *
 * This control existed twice and had drifted twice: the full player's speaker
 * icon was a no-handler <button> sitting beside a live slider with the SAME
 * accessible name, and the mini player's was the same dead icon with the slider
 * hover-revealed — so on that surface it was the only always-visible volume
 * control, and it did nothing. Fixing the full player alone left the mini player
 * inert, which is what the owner reported after the first attempt.
 *
 * Both surfaces now render this. The store owns the muted-from level, so
 * unmuting restores what the owner had set rather than jumping to 1.0.
 */
import { usePlayer } from '../PlayerProvider';

export function MuteButton({ size = 20 }: { size?: number }) {
  const { volume, toggleMute } = usePlayer();
  const muted = volume === 0;

  return (
    <button
      type="button"
      className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
      aria-label={muted ? 'Unmute' : 'Mute'}
      aria-pressed={muted}
      title={muted ? 'Unmute' : 'Mute'}
      onClick={toggleMute}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        aria-hidden="true"
      >
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
        {/* The state is SHOWN, not only announced: the owner specifically asked
            that the speaker symbol change when muted. */}
        {muted && <line x1="4" y1="4" x2="20" y2="20"></line>}
      </svg>
    </button>
  );
}
