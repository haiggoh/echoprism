import { usePlayer } from '../PlayerProvider';
import { Select } from '../ui/Select';

/**
 * Live-test Task 7: "important feature: playback speed, doesn't exist yet but
 * I want it."
 *
 * The RATE itself already existed — the player store carried `playbackRate` and
 * the engine applied it to both media elements. What was missing was any way to
 * change it, any persistence of the choice, and a re-application when the
 * source changes (see PlayerProvider). This component is the missing control.
 */
export const PLAYBACK_RATES = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2] as const;

/** A standing preference, so it outlives the session. */
export const PLAYBACK_RATE_STORAGE_KEY = 'echoprism.playbackRate';

const LABELS: Record<number, string> = {
  1: '1× Normal',
};

/**
 * Read the persisted rate. Returns null when it is absent OR unusable, so the
 * caller falls back to the store default — a media element whose playbackRate
 * is NaN silently refuses to play, so an unparseable or out-of-range value must
 * never reach it. Storage access itself can throw (private browsing), which is
 * also "no stored value", not an error worth surfacing.
 */
export function readStoredPlaybackRate(): number | null {
  let raw: string | null | undefined = null;
  try {
    // `window.localStorage?.` — the repo's guarded idiom (see useTheme.tsx):
    // jsdom in this repo runs without a localStorage global, and a hardened
    // browser can deny access entirely.
    raw = window.localStorage?.getItem(PLAYBACK_RATE_STORAGE_KEY);
  } catch {
    return null;
  }
  if (!raw) return null;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return null;
  return (PLAYBACK_RATES as readonly number[]).includes(parsed) ? parsed : null;
}

/** Best-effort persist; a storage failure must not break the rate change. */
export function writeStoredPlaybackRate(rate: number): void {
  try {
    window.localStorage?.setItem(PLAYBACK_RATE_STORAGE_KEY, String(rate));
  } catch {
    // Private browsing / quota: the choice simply does not persist.
  }
}

export function SpeedControl({ className = '' }: { className?: string }) {
  const { playbackRate, setPlaybackRate } = usePlayer();

  return (
    <Select
      aria-label="Playback speed"
      title="Playback speed"
      value={String(playbackRate)}
      className={className}
      options={PLAYBACK_RATES.map((rate) => ({
        value: String(rate),
        // 1x is labelled, because the one rate a reader cannot infer from the
        // number alone is the normal one.
        label: LABELS[rate] ?? `${rate}×`,
      }))}
      onChange={(value) => {
        const rate = Number(value);
        // Only a documented rate reaches the media element.
        if (Number.isFinite(rate) && (PLAYBACK_RATES as readonly number[]).includes(rate)) {
          setPlaybackRate(rate);
        }
      }}
    />
  );
}
