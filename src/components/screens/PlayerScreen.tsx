import { useParams } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { episodeCommands } from '../../hooks/useTauriCommands';
import { PrismConvergeToggle } from '../player/PrismConvergeToggle';
import { MiniPlayer } from '../player/MiniPlayer';

export function PlayerScreen() {
  const { episodeId } = useParams<{ episodeId: string }>();
  const [episode, setEpisode] = useState<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [playMode, setPlayMode] = useState<'unified' | 'audio' | 'video'>('unified');
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isPip, setIsPip] = useState(false);

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

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
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
            {/* Video element would go here */}
            <div className="absolute inset-0 flex items-center justify-center bg-black">
              <div className="text-center p-8">
                <p className="text-text-muted">Video player implementation in progress</p>
                <p className="text-sm mt-2 text-text-muted">
                  {episode.title}
                </p>
              </div>
            </div>
            
            {/* Picture-in-Picture placeholder */}
            <div className="absolute bottom-4 right-4 z-10">
              <button 
                onClick={() => {}}
                className="btn-ghost btn-sm"
                aria-label="Picture in Picture"
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
            <span className="text-sm text-text-muted w-12 text-right">{'0:00'}</span>
            <div className="flex-1 h-1.5 bg-surface rounded-full relative overflow-hidden">
              <div 
                className="bg-accent h-full rounded-full transition-all duration-100"
                style={{ width: `${progress}%` }}
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
            onClick={() => {}}
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
            onClick={() => {}}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="19 20 9 12 19 4 19 20"></polygon>
              <line x1="5" y1="19" x2="5" y2="5"></line>
            </svg>
          </button>

          <button 
            className={`btn-unified p-3 rounded-full ${isPlaying ? 'bg-danger' : ''}`}
            onClick={() => {}}
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
            onClick={() => {}}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="5 4 15 12 5 20 5 4"></polygon>
              <line x1="19" y1="5" x2="19" y2="19"></line>
            </svg>
          </button>

          <button 
            className="btn-ghost p-2"
            aria-label="Repeat"
            onClick={() => {}}
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
            <PrismConvergeToggle mode="unified" onModeChange={() => {}} />
            
            <div className="flex items-center gap-2 ml-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={false}
                  onChange={() => {}}
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
                value={1}
                onChange={() => {}}
                className="w-full h-1.5 bg-surface rounded-full appearance-none accent-accent"
              />
            </div>
            <button className="btn-ghost p-2" aria-label="Fullscreen">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-3m0-18V9a2 2 0 0 1 2-2h3"></path>
              </svg>
            </button>
            <button className="btn-ghost p-2" aria-label="Picture in Picture">
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

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}
