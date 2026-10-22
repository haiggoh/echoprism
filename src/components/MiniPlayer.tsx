import { useState } from 'react';
import { useQueueStore } from '../store/slices/queueSlice';
import { usePlayerStore } from '../store/slices/playerSlice';
import { PrismConvergeToggle } from './player/PrismConvergeToggle';
import { useConvergence } from '../hooks/useConvergence';
import { Thumbnail } from './ui/Thumbnail';

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
  const { isPlaying, volume, playbackState, setPlaying, setVolume } = usePlayerStore();
  const { state, setMode } = useConvergence();
  const [isExpanded, setIsExpanded] = useState(false);

  const currentItem = items[currentIndex];
  const episode = currentItem?.episode;

  if (!episode) {
    return null;
  }

  const formatTime = (seconds?: number) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const position = playbackState?.position_seconds ?? 0;
  const duration = playbackState?.duration_seconds ?? episode.duration_seconds ?? 0;
  const progressPct = duration > 0 ? (position / duration) * 100 : 0;

  return (
    <div
      className={`fixed bottom-0 left-0 right-0 z-50 transition-all duration-300 ease-in-out bg-bg-elevated border-t border-border ${
        isExpanded ? 'h-[200px]' : 'h-18'
      }`}
      onMouseEnter={() => setIsExpanded(true)}
      onMouseLeave={() => setIsExpanded(false)}
    >
      {/* Collapsed view */}
      <div className="h-18 flex items-center justify-between px-4">
        {/* Episode info */}
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <Thumbnail
            src={episode.thumbnail_url}
            alt=""
            className="w-12 h-12 rounded-md object-cover flex-shrink-0"
          />
          <div className="min-w-0 flex-1" aria-hidden="true">
            <p className="font-medium text-text truncate">{episode.title || 'Unknown'}</p>
            <p className="text-sm text-text-muted truncate">{episode.channel?.title || 'Unknown channel'}</p>
          </div>
        </div>

        {/* Center controls */}
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
            className={`p-3 rounded-full transition-all ${isPlaying ? 'bg-danger' : 'bg-accent'} text-text-inverse`}
            onClick={() => setPlaying(!isPlaying)}
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

        {/* Right side: PrismConvergeToggle + Audio toggle + Volume */}
        <div className="flex items-center gap-4">
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

          {/* Expand button */}
          <button
            className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors"
            onClick={() => setIsExpanded(!isExpanded)}
            aria-label="Expand mini player"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3m0-18V9a2 2 0 0 1 2-2h3"></path>
            </svg>
          </button>
        </div>
      </div>

      {/* Expanded view - progress bar and more controls */}
      <div className="overflow-hidden transition-all duration-300">
        <div className="px-4 py-2 border-t border-border">
          {/* Progress bar with time */}
          <div className="flex items-center gap-3 mb-3">
            <span className="text-sm text-text-muted w-12 text-right">{formatTime(position)}</span>
            <div className="flex-1 h-1.5 bg-surface rounded-full relative overflow-hidden">
              <div
                className="bg-accent h-full rounded-full transition-all duration-100"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-sm text-text-muted w-12 text-right">{formatTime(duration)}</span>
          </div>

          {/* Expanded controls */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <button className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors" aria-label="Shuffle" onClick={() => setShuffle(!shuffle)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="16 3 22 3 22 9"></polyline>
                  <polyline points="8 21 2 21 2 15"></polyline>
                  <line x1="15" y1="12" x2="9" y2="6"></line>
                  <line x1="21" y1="21" x2="9" y2="9"></line>
                </svg>
              </button>
              <button className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors" aria-label="Previous" onClick={previousTrack}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="19 20 9 12 19 4 19 20"></polygon>
                  <line x1="5" y1="19" x2="5" y2="5"></line>
                </svg>
              </button>
              <button className="p-3 rounded-full bg-accent text-text-inverse" aria-label="Play" onClick={() => setPlaying(!isPlaying)}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                  {isPlaying ? (
                    <>
                      <rect x="6" y="4" width="4" height="16"></rect>
                      <rect x="14" y="4" width="4" height="16"></rect>
                    </>
                  ) : (
                    <polygon points="5 3 19 12 5 21 5 3"></polygon>
                  )}
                </svg>
              </button>
              <button className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors" aria-label="Next" onClick={nextTrack}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polygon points="5 4 15 12 5 20 5 4"></polygon>
                  <line x1="19" y1="5" x2="19" y2="19"></line>
                </svg>
              </button>
              <button className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors" aria-label="Repeat" onClick={() => {}}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="1 4 1 10 7 10"></polyline>
                  <polyline points="23 20 23 14 17 14"></polyline>
                  <path d="M10 4v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2"></path>
                </svg>
              </button>
            </div>

            <div className="flex items-center gap-4">
              <PrismConvergeToggle mode={state.mode} onModeChange={setMode} size="sm" />

              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={audioOnlyMode}
                    onChange={(e) => setAudioOnlyMode(e.target.checked)}
                    className="w-4 h-4 accent-accent rounded border-border"
                    aria-label="Audio only mode"
                  />
                  <span className="text-sm text-text-muted">Audio only</span>
                </label>
              </div>

              <div className="relative group">
                <button className="p-2 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors" aria-label="Volume">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                  </svg>
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={volume}
                  onChange={(e) => setVolume(parseFloat(e.target.value))}
                  aria-label="Volume"
                  className="w-32 h-1.5 bg-surface rounded-full appearance-none accent-accent opacity-0 invisible transition-all duration-200 group-hover:opacity-100 group-hover:visible"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
