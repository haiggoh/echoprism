interface QueueEmptyStateProps {
  audioMode: boolean;
  onAction: () => void;
}

export function QueueEmptyState({ audioMode, onAction }: QueueEmptyStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center p-8 text-center">
      <div className="w-16 h-16 mb-6 bg-gradient-to-br from-stream-video to-stream-audio rounded-2xl flex items-center justify-center">
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5">
          <line x1="8" y1="6" x2="21" y2="6"></line>
          <line x1="8" y1="12" x2="21" y2="12"></line>
          <line x1="8" y1="18" x2="21" y2="18"></line>
          <line x1="3" y1="6" x2="3.01" y2="6"></line>
          <line x1="3" y1="12" x2="3.01" y2="12"></line>
          <line x1="3" y1="18" x2="3.01" y2="18"></line>
        </svg>
      </div>
      <h3 className="text-lg font-semibold text-text mb-2">
        {audioMode ? 'Your audio queue is empty' : 'Your queue is empty'}
      </h3>
      <p className="text-sm text-text-muted mb-6 max-w-sm">
        {audioMode
          ? 'Add podcast episodes (or videos in audio mode) and they will line up here.'
          : 'Add episodes from your feed with "Play next" or "Add to end" and they will line up here.'}
      </p>
      <button className="btn-unified" onClick={onAction}>
        Browse Feed
      </button>
    </div>
  );
}
