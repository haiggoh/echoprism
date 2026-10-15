import { Episode } from '../../types';

interface EpisodeCardProps {
  episode: Episode;
  variant?: 'video' | 'audio' | 'smart-link';
  onClick?: () => void;
  onQueue?: (mode: 'play_next' | 'add_end') => void;
}

export function EpisodeCard({ episode, onClick, onQueue }: EpisodeCardProps) {
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
      <div className="relative aspect-video overflow-hidden bg-bg-elevated">
        {episode.thumbnail_url ? (
          <img
            src={episode.thumbnail_url}
            alt=""
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center bg-bg-elevated">
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-border">
              {isAudio ? (
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7c0-2.21-1.79-4-4-4H2v2h2v10.55c0 3.87 3.13 7 7 7 1.1 0 2.1-.3 2.8-.86l2.14 2.14 1.41-1.41-2.14-2.14C17.25 12.81 18 10.79 18 8.5c0-2.76-2.24-5-5-5H5.53l3.53-3.53 1.41-1.41L1.82 2.22 3.23 3.64l3.53 3.53 1.41-1.41-3.53-3.53A9.01 9.01 0 0112 2c-4.97 0-9 4.03-9 9s4.03 9 9 9c4.6 0 8.51-3.48 8.84-8H12V3zm0 16c-3.31 0-6-2.69-6-6s2.69-6 6-6 6 2.69 6 6-2.69 6-6 6zm-1.5-9c0 .83-.67 1.5-1.5 1.5S12 13.83 12 13s.67 1.5 1.5 1.5S15 13.83 15 13s-.67-1.5-1.5-1.5z"></path>
              ) : (
                <polygon points="23 7 16 12 23 17 23 7"></polygon>
              )}
            </svg>
          </div>
        )}

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
          <img 
            src={episode.channel?.thumbnail_url || ''} 
            alt="" 
            className="w-5 h-5 rounded-full object-cover"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
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
