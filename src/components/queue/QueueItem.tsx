interface QueueItemComponentProps {
  item: {
    id: string;
    episode: {
      id: string;
      title: string;
      thumbnail_url?: string;
      channel?: { title: string };
      duration_seconds?: number;
      video_id?: string;
      podcast_guid?: string;
      smart_link_id?: string;
    };
    position: number;
    isPlaying: boolean;
    playMode: 'video' | 'audio' | 'unified';
    onRemove: () => void;
    onPlay: () => void;
    onQueueAction: (action: 'play_next' | 'add_end' | 'remove') => void;
    onModeChange: (mode: 'video' | 'audio' | 'unified') => void;
  }
  isDragging?: boolean;
  onDragStart?: () => void;
  onDragEnd?: () => void;
}

export function QueueItemComponent({ 
  item, 
  isPlaying, 
  playMode, 
  isDragging, 
  onRemove, 
  onPlay, 
  onQueueAction,
  onModeChange 
}: QueueItemComponentProps) {
  const formatTime = (seconds?: number) => {
    if (!seconds) return '';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const episode = item.episode;
  const isAudio = episode.podcast_guid;
  const isVideo = episode.video_id;

  return (
    <article 
      className={`group flex items-center gap-3 p-3 rounded-lg transition-all duration-200 ${
        isPlaying ? 'bg-accent-soft border-l-3 border-accent' : 'bg-surface border border-border hover:border-border-strong'
      } ${isDragging ? 'opacity-80 shadow-lg rotate-1' : ''}`}
      draggable={true}
      onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; }}
    >
      {/* Drag handle */}
      <button 
        className="p-1 text-text-muted hover:text-text hover:bg-surface-hover rounded transition-colors"
        aria-label="Drag to reorder"
        onMouseDown={(e) => { e.stopPropagation(); }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="9" cy="6" r="1.5"></circle>
          <circle cx="9" cy="12" r="1.5"></circle>
          <circle cx="9" cy="18" r="1.5"></circle>
          <circle cx="15" cy="6" r="1.5"></circle>
          <circle cx="15" cy="12" r="1.5"></circle>
          <circle cx="15" cy="18" r="1.5"></circle>
        </svg>
      </button>

      {/* Thumbnail */}
      <div className="relative w-16 h-9 flex-shrink-0 rounded-md overflow-hidden bg-bg-elevated">
        <img 
          src={''} 
          alt="" 
          className="w-full h-full object-cover"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
        <div className="absolute bottom-1 right-1 bg-black/80 text-white text-xs px-1 py-0.5 rounded">
          0:00
        </div>
      </div>

      {/* Info */}
      <div className="min-w-0 flex-1">
        <h4 className="font-medium text-text truncate">Episode title</h4>
        <p className="text-sm text-text-muted truncate">Channel name</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="px-1.5 py-0.5 text-xs font-medium bg-accent-soft text-accent rounded-full">
            Unified
          </span>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        <button className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors" aria-label="Play next">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
            <line x1="19" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>
        <button className="p-1.5 rounded-lg text-text-muted hover:text-text hover:bg-surface-hover transition-colors" aria-label="Add to end">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </button>
        <button className="p-1.5 rounded-lg text-text-muted hover:text-danger hover:bg-danger-soft transition-colors" aria-label="Remove from queue">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
        </button>
      </div>
    </article>
  );
}
