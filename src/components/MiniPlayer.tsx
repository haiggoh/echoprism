import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueueStore } from '../store/slices/queueSlice';
import { usePlayer } from './PlayerProvider';
import { PrismConvergeToggle } from './player/PrismConvergeToggle';
import { SpeedControl } from './player/SpeedControl';
import { useConvergence } from '../hooks/useConvergence';
import { Thumbnail } from './ui/Thumbnail';

/**
 * Live-test pass (2026-10-23): the owner counted THREE playbars — this
 * component's collapsed row, its hover-expanded panel (which rendered a
 * SECOND, duplicate set of transport controls: the "two queue bars"), and
 * the full player's own. ONE player engine exists; it gets exactly TWO
 * control surfaces: this single bar, and the full player screen. The
 * hover panel is gone; its only real content (the seekable progress) is
 * now an always-visible strip integrated into the bar's top edge; the
 * expand chevron navigates to the full player instead of growing a second
 * bar. Also fixed: the play button no longer turns danger-red while
 * playing (playing is not an error).
 */
export function MiniPlayer() {
  const {
    items,
    currentIndex,
    shuffle,
    setShuffle,
    audioOnlyMode,
    setAudioOnlyMode,
    nextTrack,
    previousTrack,
  } = useQueueStore();
  const { isPlaying, togglePlay, volume, setVolume, currentTime, duration, seek } = usePlayer();
  const { state, setMode } = useConvergence();
  const navigate = useNavigate();
  const seekStripRef = useRef<HTMLDivElement>(null);

  const currentItem = items[currentIndex];
  const episode = currentItem?.episode;

  const totalDuration = duration || episode?.duration_seconds || 0;
  const progressPct =
    totalDuration > 0 ? Math.min(100, (currentTime / totalDuration) * 100) : 0;

  if (!episode) {
    return null;
  }

  const formatTime = (seconds?: number) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const seekFromPointer = (clientX: number) => {
    const el = seekStripRef.current;
    if (!el || totalDuration <= 0) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    seek(ratio * totalDuration);
  };

  const seekWithKeys = (e: React.KeyboardEvent) => {
    if (totalDuration <= 0) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      seek(Math.min(totalDuration, currentTime + 10));
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      seek(Math.max(0, currentTime - 10));
    }
  };

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 bg-bg-elevated border-t border-border"
      aria-label="Mini player"
    >
      {/* Integrated seek strip — the hover panel's one real content, now
          always visible, mouse- and keyboard-operable (2b's bar). */}
      <div
        ref={seekStripRef}
        role="slider"
        aria-label="Seek"
        tabIndex={0}
        aria-valuemin={0}
        aria-valuemax={Math.round(totalDuration)}
        aria-valuenow={Math.round(currentTime)}
        aria-valuetext={`${formatTime(currentTime)} of ${formatTime(totalDuration)}`}
        onClick={(e) => seekFromPointer(e.clientX)}
        onKeyDown={seekWithKeys}
        className="group h-3 -mt-1.5 flex items-center cursor-pointer"
      >
        <div className="w-full h-1 bg-surface rounded-full relative overflow-hidden group-hover:h-1.5 transition-all">
          <div
            className="bg-accent h-full rounded-full"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      <div className="flex items-center justify-between px-4 h-[60px]">
        {/* Episode info */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Thumbnail
            src={episode.thumbnail_url}
            alt=""
            className="w-10 h-10 rounded-md object-cover flex-shrink-0"
          />
          <div className="min-w-0 flex-1">
            <p className="font-medium text-text truncate">{episode.title || 'Unknown'}</p>
            <p className="text-sm text-text-muted truncate">
              {episode.channel?.title || 'Unknown channel'}
            </p>
          </div>
        </div>

        {/* The ONE set of transport controls */}
        <div className="flex items-center gap-4">
          <button
            className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
            aria-label="Shuffle"
            onClick={() => setShuffle(!shuffle)}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="16 3 22 3 22 9"></polyline>
              <polyline points="8 21 2 21 2 15"></polyline>
              <line x1="15" y1="12" x2="9" y2="6"></line>
              <line x1="21" y1="21" x2="9" y2="9"></line>
            </svg>
          </button>

          <button
            className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
            aria-label="Previous"
            onClick={previousTrack}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="19 20 9 12 19 4 19 20"></polygon>
              <line x1="5" y1="19" x2="5" y2="5"></line>
            </svg>
          </button>

          <button
            className="p-3 rounded-full bg-accent text-text-inverse hover:bg-accent-hover transition-colors"
            onClick={() => togglePlay()}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16"></rect>
                <rect x="14" y="4" width="4" height="16"></rect>
              </svg>
            ) : (
              <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
            )}
          </button>

          <button
            className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
            aria-label="Next"
            onClick={nextTrack}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="5 4 15 12 5 20 5 4"></polygon>
              <line x1="19" y1="5" x2="19" y2="19"></line>
            </svg>
          </button>
        </div>

        {/* Right side: PrismConvergeToggle + Audio toggle + Speed + Volume + time */}
        <div className="flex items-center gap-4">
          <span className="text-sm text-text-muted tabular-nums hidden md:block">
            {formatTime(currentTime)} / {formatTime(totalDuration)}
          </span>

          {/* Live-test Task 7: playback speed. Hidden on narrow layouts,
              where the bar is already crowded — the full player has it
              always. */}
          <div className="w-24 hidden md:block">
            <SpeedControl />
          </div>

          <PrismConvergeToggle mode={state.mode} onModeChange={setMode} size="sm" />

          <label className="flex items-center gap-2 cursor-pointer hidden md:flex">
            <input
              type="checkbox"
              checked={audioOnlyMode}
              onChange={(e) => setAudioOnlyMode(e.target.checked)}
              className="w-4 h-4 accent-accent rounded border-border"
              aria-label="Audio only mode"
            />
            <span className="text-sm text-text-muted">Audio</span>
          </label>

          {/* Volume */}
          <div className="relative group">
            <button
              className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
              aria-label="Volume"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
              </svg>
            </button>
            <div className="absolute bottom-full right-0 mb-2 w-32 opacity-0 invisible transition-all duration-200 group-hover:opacity-100 group-hover:visible">
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                aria-label="Volume"
                className="w-full h-1.5 bg-surface rounded-full appearance-none accent-accent"
              />
            </div>
          </div>

          {/* Open the full player — the deep control surface */}
          <button
            className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
            onClick={() => navigate(`/player/${episode.id}`)}
            aria-label="Open full player"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 3h6v6"></path>
              <path d="M10 14L21 3"></path>
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
