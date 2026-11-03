import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueueStore } from '../store/slices/queueSlice';
import { usePlayer } from './PlayerProvider';
import { AudioOnlyToggle } from './player/AudioOnlyToggle';
import { ShuffleButton } from './ui/ShuffleButton';
import { MuteButton } from './ui/MuteButton';
import { SpeedControl } from './player/SpeedControl';
import { Thumbnail } from './ui/Thumbnail';

/**
 * Parity audit batch 3 (owner, 2026-11-02): "we need only one main play bar
 * at the bottom." This bar is now THE transport everywhere — the player
 * screen's own control block is gone, and its Repeat, Fullscreen and
 * Picture-in-Picture live here. It shows what the ENGINE has loaded
 * (currentEpisode), not the queue's cursor item, so an episode played from
 * outside the queue still has its bar.
 *
 * History — live-test pass (2026-10-23): the owner counted THREE playbars — this
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
  const { shuffle, setShuffle, repeatMode, setRepeatMode, nextTrack, previousTrack } = useQueueStore();
  const {
    currentEpisode: episode,
    isPlaying,
    togglePlay,
    volume,
    setVolume,
    currentTime,
    duration,
    seek,
    restart,
    hasNext,
    hasPrevious,
    isPip,
    canPip,
    togglePip,
    switchToLinked,
  } = usePlayer();
  const navigate = useNavigate();
  const seekStripRef = useRef<HTMLDivElement>(null);

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

  const cycleRepeat = () => {
    setRepeatMode(repeatMode === 'off' ? 'all' : repeatMode === 'all' ? 'one' : 'off');
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void document.documentElement.requestFullscreen?.();
    }
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
          {/* Live-test batch 2 Task 1b/1c: shuffle IS wired — it just had no
              pressed state and an unreadable glyph. Shared ShuffleButton. */}
          <ShuffleButton
            active={shuffle}
            onToggle={() => setShuffle(!shuffle)}
            size={18}
            // The ONLY shuffle now (batch 3): it keeps the visible label the
            // owner needed to recognise it (batch 2 Task 1c, 4e0a68ba).
          />

          <button
            className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Previous"
            // Disabled at the first item — a press that silently does nothing
            // reads as a broken button (Review Focus 4). Previous ALWAYS means
            // the previous item; restarting has its own button.
            disabled={!hasPrevious}
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
            className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Next"
            disabled={!hasNext}
            onClick={nextTrack}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="5 4 15 12 5 20 5 4"></polygon>
              <line x1="19" y1="5" x2="19" y2="19"></line>
            </svg>
          </button>

          {/* Live-test Task 8: Restart is its own button, so Previous can
              always mean Previous (owner decision 2026-10-27 11:20). */}
          <button
            className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label="Restart"
            // Enabled whenever something is loaded — it was tied to the queue
            // having neighbours, so a single episode could not be restarted.
            onClick={restart}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M3 12a9 9 0 1 1 9 9"></path>
              <polyline points="3 12 3 6 9 6"></polyline>
            </svg>
          </button>

          <button
            className={`p-2 rounded-lg transition-colors hover:bg-surface-hover ${repeatMode !== 'off' ? 'text-accent' : 'text-text-muted hover:text-text'}`}
            aria-label={`Repeat: ${repeatMode}`}
            aria-pressed={repeatMode !== 'off'}
            title={`Repeat: ${repeatMode}`}
            onClick={cycleRepeat}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <polyline points="17 1 21 5 17 9"></polyline>
              <path d="M3 11V9a4 4 0 0 1 4-4h14"></path>
              <polyline points="7 23 3 19 7 15"></polyline>
              <path d="M21 13v2a4 4 0 0 1-4 4H3"></path>
            </svg>
            {repeatMode === 'one' && <span className="sr-only">one</span>}
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

          {/* Smart-link one-tap switch: only when this episode has a twin.
              The label names what you get: the OTHER stream's version. */}
          {episode.linked_episode_id && (
            <button
              className="px-2 py-1 rounded-lg text-sm text-accent hover:bg-surface-hover transition-colors flex items-center gap-1"
              onClick={() => void switchToLinked()}
              aria-label={episode.video_id || episode.video_url ? 'Switch to podcast version' : 'Switch to YouTube version'}
              title="Smart link: switch to the linked version (podcast vs YouTube — not the same as audio-only), same position"
            >
              <span aria-hidden="true">🔗</span>
              <span className="hidden md:inline">{episode.video_id || episode.video_url ? 'Podcast version' : 'YouTube version'}</span>
            </button>
          )}

          {/* One of the TWO audio-only controls (owner decision 2026-11-02). */}
          <AudioOnlyToggle label="Audio" hideLabelBelow="md" />

          {/* Volume — live-test batch 2 Task 1, mini player.
              This was the SAME dead <button aria-label="Volume"> the full player
              carried: no handler, and the slider beside it hover-revealed
              (`opacity-0 invisible group-hover:opacity-100`) so this icon was the
              only always-visible volume control on this surface. Fixing the full
              player alone left it inert — which is exactly what the owner saw
              after the first attempt. It is the same mute toggle now (shared
              store action), so the two surfaces cannot drift apart again. */}
          <div className="relative group flex items-center">
            <MuteButton size={18} />
            {/* Owner 2026-11-03: the volume bar is VERTICAL and pops up above
                the mute button — clear of the seek strip (the play bar at the
                bar's top edge) — instead of a wide horizontal panel across
                the bar. Native vertical slider on WKWebView. */}
            <div className="absolute bottom-full right-0 mb-2 h-28 w-10 flex items-center justify-center opacity-0 invisible transition-all duration-200 group-hover:opacity-100 group-hover:visible">
              <input
                type="range"
                min="0"
                max="1"
                step="0.1"
                value={volume}
                onChange={(e) => setVolume(parseFloat(e.target.value))}
                aria-label="Volume"
                className="h-24 w-6 accent-accent bg-surface rounded-full [-webkit-appearance:slider-vertical]"
              />
            </div>
          </div>

          <button
            className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            aria-label={isPip ? 'Exit Picture in Picture' : 'Picture in Picture'}
            // Needs the player screen's <video>: audio and other screens have
            // nothing to float, so the button says so instead of no-op'ing.
            disabled={!canPip}
            onClick={togglePip}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M21 15V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3"></path>
              <rect x="1" y="1" width="10" height="10" rx="1"></rect>
            </svg>
          </button>

          <button
            className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
            aria-label="Fullscreen"
            onClick={toggleFullscreen}
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path>
            </svg>
          </button>

          {/* Open the full player — the video stage */}
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
