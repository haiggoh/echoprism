import { Episode } from '../../types';
import { Thumbnail } from '../ui/Thumbnail';
import { HeadphonesIcon } from '../ui/HeadphonesIcon';
import { useHoverPreview } from '../../hooks/useHoverPreview';
import { EpisodePreview } from '../ui/EpisodePreview';

interface EpisodeCardProps {
  episode: Episode;
  variant?: 'video' | 'audio' | 'smart-link';
  onClick?: () => void;
  onQueue?: (mode: 'play_next' | 'add_end') => void;
}

export function EpisodeCard({ episode, onClick, onQueue }: EpisodeCardProps) {
  // Phase E: the hover preview hooks onto the thumbnail container — the
  // feature's ONLY call site (useHoverPreview.ts is the unplug boundary).
  // Podcast-shaped episodes carry no video_id, so the hook stays idle for
  // them by construction.
  const { spec, frameIndex, onPointerEnter, onPointerLeave } = useHoverPreview(episode.video_id);
  const formatTime = (seconds?: number) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const isAudio = episode.podcast_guid || episode.audio_url;
  const isVideo = episode.video_id || episode.video_url;
  const hasSmartLink = episode.smart_link_id;

  return (
    <article 
      className="group bg-surface border border-border rounded-xl overflow-hidden transition-all duration-200 hover:border-border-strong hover:shadow-md"
      onClick={onClick}
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onClick?.(); }}}
    >
      {/* Thumbnail */}
      <div
        className="relative aspect-video overflow-hidden bg-bg-elevated"
        onPointerEnter={onPointerEnter}
        onPointerLeave={onPointerLeave}
      >
        {episode.thumbnail_url ? (
          <Thumbnail
            src={episode.thumbnail_url}
            alt=""
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-bg-elevated">
            {isAudio ? (
              <HeadphonesIcon className="text-border" data-testid="podcast-fallback-icon" />
            ) : (
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-border">
                <polygon points="23 7 16 12 23 17 23 7"></polygon>
              </svg>
            )}
          </div>
        )}

        {spec && <EpisodePreview spec={spec} frameIndex={frameIndex} />}

        {/* Duration badge */}
        {episode.duration_seconds && (
          <span className="absolute bottom-2 right-2 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded">
            {formatTime(episode.duration_seconds)}
          </span>
        )}

        {/* Playing indicator */}
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
          <button className="p-3 rounded-full bg-white/90 text-bg hover:bg-white transition-colors" aria-label="Play">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
          </button>
        </div>

        {/* Smart Link badge */}
        <div className="absolute top-2 left-2 flex gap-1">
          {/* Smart Link badge would go here */}
        </div>

        {/* Format badges */}
        <div className="absolute bottom-2 left-2 flex gap-1">
          {isAudio && (
            <span className="px-1.5 py-0.5 text-xs font-medium bg-audio-soft text-audio rounded-full">
              Audio
            </span>
          )}
          {isVideo && (
            <span className="px-1.5 py-0.5 text-xs font-medium bg-video-soft text-video rounded-full">
              Video
            </span>
          )}
          {hasSmartLink && (
            <span className="px-1.5 py-0.5 text-xs font-medium bg-accent-soft text-accent rounded-full flex items-center gap-1">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
                <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
              </svg>
              Link
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="font-medium text-text line-clamp-2 mb-2 group-hover:text-accent transition-colors">
          {episode.title}
        </h3>
        
        <div className="flex items-center gap-2 text-sm text-text-muted mb-2">
          <Thumbnail
            src={episode.channel?.thumbnail_url}
            alt=""
            className="w-5 h-5 rounded-full object-cover"
          />
          <span className="truncate max-w-[150px]">{episode.channel?.title || 'Unknown'}</span>
          {episode.published_at && (
            <span>{new Date(episode.published_at).toLocaleDateString()}</span>
          )}
        </div>

        {/* Queue actions */}
        <div className="flex items-center gap-2 pt-2 border-t border-border">
          <button 
            className="flex-1 btn-ghost btn-sm flex items-center justify-center gap-1"
            onClick={(e) => { e.stopPropagation(); onQueue?.('play_next'); }}
            aria-label="Play next"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
              <line x1="19" y1="12" x2="19" y2="12"></line>
            </svg>
            <span className="text-xs">Next</span>
          </button>
          <button 
            className="btn-ghost btn-sm flex items-center justify-center gap-1"
            onClick={(e) => { e.stopPropagation(); onQueue?.('add_end'); }}
            aria-label="Add to end"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19"></line>
              <line x1="5" y1="12" x2="19" y2="12"></line>
            </svg>
            <span className="text-xs">End</span>
          </button>
        </div>

        {/* Smart Link badge */}
        <div className="mt-2 flex items-center gap-1">
          {/* Smart link badge would go here */}
        </div>
      </div>
    </article>
  );
}
