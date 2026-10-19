import { useParams } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import type { MouseEvent } from 'react';
import { episodeCommands } from '../../hooks/useTauriCommands';
import { PrismConvergeToggle } from '../player/PrismConvergeToggle';
import { usePlayer } from '../PlayerProvider';
import { useQueueStore } from '../../store/slices/queueSlice';
import { useConvergence } from '../../hooks/useConvergence';
import { Episode } from '../../types';

export function PlayerScreen() {
  const { episodeId } = useParams<{ episodeId: string }>();
  const [episode, setEpisode] = useState<Episode | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const {
    isPlaying,
    playbackFormat,
    isAudioMode,
    isPip,
    volume,
    currentTime,
    duration,
    togglePlay,
    seek,
    setVolume,
    setAudioMode,
    togglePip,
    nextTrack,
    previousTrack,
    registerVideoElement,
  } = usePlayer();
  const { shuffle, setShuffle, repeatMode, setRepeatMode } = useQueueStore();
  const { state, setMode } = useConvergence();
  const progressBarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (episodeId) {
      loadEpisode();
    }
  }, [episodeId]);

  const loadEpisode = async () => {
    if (!episodeId) return;
    setIsLoading(true);
    try {
      const data = await episodeCommands.get(episodeId);
      setEpisode(data);
    } catch (error) {
      console.error('Failed to load episode:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const formatTime = (seconds?: number) => {
    if (!seconds) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const handleSeek = (e: MouseEvent<HTMLDivElement>) => {
    if (duration <= 0 || !progressBarRef.current) return;
    const rect = progressBarRef.current.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
    seek(ratio * duration);
  };

  const progressPct = duration > 0 ? (currentTime / duration) * 100 : 0;

  const cycleRepeat = () => {
    setRepeatMode(repeatMode === 'off' ? 'all' : repeatMode === 'all' ? 'one' : 'off');
  };

  const toggleFullscreen = () => {
    if (document.fullscreenElement) {
      void document.exitFullscreen();
    } else {
      void document.documentElement.requestFullscreen();
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg">
        <div className="convergence-loader" role="status" aria-label="Loading player">
          <div className="convergence-loader-beams" />
          <div className="convergence-loader-prism" />
        </div>
      </div>
    );
  }

  if (!episode) {
    return (
      <div className="flex h-screen items-center justify-center bg-bg">
        <div className="text-center p-8">
          <h2 className="text-xl font-semibold text-text mb-2">Episode not found</h2>
          <p className="text-text-muted">The episode could not be loaded.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-bg">
      {/* Video Player Area */}
      <div className="relative w-full aspect-video bg-black">
        {isLoading ? (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="convergence-loader" role="status">
              <div className="convergence-loader-beams" />
              <div className="convergence-loader-prism" />
            </div>
          </div>
        ) : (
          <>
            {/* Render follows the ENGINE's format (what is actually playing —
                D7 chain mode included), not the user's audio-only preference:
                a video rule under an audio-on toggle still shows picture. The
                toggle reaches this through setAudioMode, which updates both. */}
            {playbackFormat === 'video' ? (
              <video
                ref={registerVideoElement}
                className="absolute inset-0 h-full w-full bg-black"
                poster={episode.thumbnail_url}
                playsInline
              />
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-black">
                <div className="w-24 h-24 mb-4 bg-gradient-to-br from-stream-video to-stream-audio rounded-2xl flex items-center justify-center">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5">
                    <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7c0-2.21-1.79-4-4-4H2v2h2v10.55c0 3.87 3.13 7 7 7 1.1 0 2.1-.3 2.8-.86l2.14 2.14 1.41-1.41-2.14-2.14C17.25 12.81 18 10.79 18 8.5c0-2.76-2.24-5-5-5H5.53l3.53-3.53 1.41-1.41L1.82 2.22 3.23 3.64l3.53 3.53 1.41-1.41-3.53-3.53A9.01 9.01 0 0112 2c-4.97 0-9 4.03-9 9s4.03 9 9 9c4.6 0 8.51-3.48 8.84-8H12V3zm0 16c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6zm-1.5-9c0 .83-.67 1.5-1.5 1.5S12 13.83 12 13s.67 1.5 1.5 1.5S15 13.83 15 13s-.67-1.5-1.5-1.5z"></path>
                  </svg>
                </div>
                <p className="text-sm text-text-muted">Audio mode — playback continues in the mini player</p>
              </div>
            )}

            {/* Picture-in-Picture */}
            <div className="absolute bottom-4 right-4 z-10">
              <button
                onClick={togglePip}
                className="btn-ghost btn-sm"
                aria-label={isPip ? 'Exit Picture in Picture' : 'Picture in Picture'}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M21 15V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3"></path>
                  <rect x="1" y="1" width="10" height="10" rx="1"></rect>
                </svg>
              </button>
            </div>
          </>
        )}
      </div>

      {/* Player Controls */}
      <div className="p-4 border-t border-border bg-bg-elevated">
        {/* Progress Bar */}
        <div className="mb-4">
          <div className="flex items-center gap-3 mb-2">
            <span className="text-sm text-text-muted w-12 text-right">{formatTime(currentTime)}</span>
            <div
              ref={progressBarRef}
              className="flex-1 h-1.5 bg-surface rounded-full relative overflow-hidden cursor-pointer"
              onClick={handleSeek}
            >
              <div
                className="bg-accent h-full rounded-full transition-all duration-100"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            <span className="text-sm text-text-muted w-12">{formatTime(duration)}</span>
          </div>
        </div>

        {/* Main Controls */}
        <div className="flex items-center justify-center gap-6 mb-4">
          <button
            className="btn-ghost p-2"
            aria-label="Shuffle"
            onClick={() => setShuffle(!shuffle)}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="16 3 22 3 22 9"></polyline>
              <polyline points="8 21 2 21 2 15"></polyline>
              <line x1="15" y1="12" x2="9" y2="6"></line>
              <line x1="21" y1="21" x2="9" y2="9"></line>
            </svg>
          </button>

          <button
            className="btn-ghost p-2"
            aria-label="Previous"
            onClick={previousTrack}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="19 20 9 12 19 4 19 20"></polygon>
              <line x1="5" y1="19" x2="5" y2="5"></line>
            </svg>
          </button>

          <button
            className={`btn-unified p-3 rounded-full ${isPlaying ? 'bg-danger' : ''}`}
            onClick={togglePlay}
            aria-label={isPlaying ? 'Pause' : 'Play'}
          >
            {isPlaying ? (
              <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="4" width="4" height="16"></rect>
                <rect x="14" y="4" width="4" height="16"></rect>
              </svg>
            ) : (
              <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3"></polygon>
              </svg>
            )}
          </button>

          <button
            className="btn-ghost p-2"
            aria-label="Next"
            onClick={nextTrack}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="5 4 15 12 5 20 5 4"></polygon>
              <line x1="19" y1="5" x2="19" y2="19"></line>
            </svg>
          </button>

          <button
            className="btn-ghost p-2"
            aria-label={`Repeat: ${repeatMode}`}
            onClick={cycleRepeat}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="1 4 1 10 7 10"></polyline>
              <polyline points="23 20 23 14 17 14"></polyline>
              <path d="M10 4v6a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2"></path>
            </svg>
          </button>
        </div>

        {/* Secondary Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <PrismConvergeToggle
              mode={state.mode}
              onModeChange={(m) => {
                setMode(m);
                setAudioMode(m === 'audio');
              }}
            />

            <div className="flex items-center gap-2 ml-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={isAudioMode}
                  onChange={(e) => setAudioMode(e.target.checked)}
                  className="w-4 h-4 accent-accent rounded border-border"
                />
                <span className="text-sm text-text-muted">Audio only</span>
              </label>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <button className="btn-ghost p-2" aria-label="Volume">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
              </svg>
            </button>
            <div className="w-32">
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
            <button className="btn-ghost p-2" aria-label="Fullscreen" onClick={toggleFullscreen}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3m0-18V9a2 2 0 0 1 2-2h3"></path>
              </svg>
            </button>
            <button className="btn-ghost p-2" aria-label="Picture in Picture" onClick={togglePip}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M21 15V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3"></path>
                <rect x="1" y="1" width="10" height="10" rx="1"></rect>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
