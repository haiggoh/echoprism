import { usePlayer } from '../PlayerProvider';
import { usePlayerStore } from '../../store/slices/playerSlice';

/**
 * THE audio-only control (parity audit batch 3, owner decision 2026-11-02:
 * one state, two controls — the bottom bar and the Header). Bound to the
 * engine's own state, so a toggle re-resolves the current stream as audio (or
 * back to video). There were five checkboxes over three states before, and the
 * four the owner could see wrote a flag the engine never read.
 */
export function AudioOnlyToggle({ label = 'Audio only', hideLabelBelow }: { label?: string; hideLabelBelow?: 'sm' | 'md' }) {
  const { isAudioMode, setAudioMode } = usePlayer();
  // Task 11: badge when audio-only is on because of the metered-network rule.
  const auto = usePlayerStore((s) => s.audio_only_auto);
  const labelClass =
    hideLabelBelow === 'md' ? 'hidden md:inline' : hideLabelBelow === 'sm' ? 'hidden sm:inline' : '';
  return (
    <label className="flex items-center gap-2 cursor-pointer">
      <input
        type="checkbox"
        checked={isAudioMode}
        onChange={(e) => setAudioMode(e.target.checked)}
        className="w-4 h-4 accent-accent rounded border-border"
        aria-label="Audio only mode"
      />
      <span className={`text-sm text-text-muted ${labelClass}`}>{label}</span>
      {auto && isAudioMode && (
        <span
          className="px-1.5 py-0.5 text-[10px] font-medium bg-accent-soft text-accent rounded-full"
          title="On automatically because the network is metered"
        >
          auto
        </span>
      )}
    </label>
  );
}
