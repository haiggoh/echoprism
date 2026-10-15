export interface EmptyStateProps {
  variant: 'feed' | 'queue' | 'search' | 'history' | 'downloads' | 'onboarding' | 'channels' | 'smart-links';
  query?: string;
  onAction?: () => void;
  actionLabel?: string;
  customTitle?: string;
  customDescription?: string;
}

export function EmptyState({ 
  variant, 
  query, 
  onAction, 
  actionLabel,
  customTitle,
  customDescription 
}: EmptyStateProps) {
  const configs = {
    feed: {
      title: customTitle || 'No channels added',
      description: customDescription || 'Import your YouTube subscriptions or add channels manually to start building your feed.',
      actionLabel: actionLabel || 'Browse Channels',
      icon: (
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-border">
          <path d="M21 15V6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3"></path>
          <path d="M14 10l-4 4 4 4"></path>
        </svg>
      )},
    queue: {
      title: customTitle || 'Queue is empty',
      description: customDescription || 'Pick videos or podcasts from your feed and add them to the queue. Use "Play next" or "Add to end".',
      actionLabel: actionLabel || 'Go to Feed',
      icon: (
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-border">
          <line x1="8" y1="6" x2="21" y2="6"></line>
          <line x1="8" y1="12" x2="21" y2="12"></line>
          <line x1="8" y1="18" x2="21" y2="18"></line>
          <line x1="3" y1="6" x2="3.01" y2="18"></line>
        </svg>
      )},
    search: {
      title: customTitle || `No results for "${query}"`,
      description: customDescription || 'Try different search terms or check your spelling.',
      actionLabel: actionLabel || 'Clear Search',
      icon: (
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-border">
          <circle cx="11" cy="11" r="8"></circle>
          <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
          <line x1="13" y1="6.5" x2="13" y2="17.5"></line>
        </svg>
      )},
    history: {
      title: customTitle || 'Nothing played yet',
      description: customDescription || 'Your watch history will appear here once you start watching or listening.',
      actionLabel: actionLabel || 'Go to Feed',
      icon: (
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-border">
          <circle cx="12" cy="12" r="10"></circle>
          <polyline points="12 6 12 12 16 14"></polyline>
        </svg>
      )},
    downloads: {
      title: customTitle || 'No downloads yet',
      description: customDescription || 'Tap the download button on any video or podcast episode to save it for offline viewing.',
      actionLabel: actionLabel || 'Go to Feed',
      icon: (
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-border">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
          <polyline points="7 10 12 15 17 10"></polyline>
          <line x1="12" y1="15" x2="12" y2="3"></line>
        </svg>
      )},
    onboarding: {
      title: customTitle || 'Welcome to EchoPrism',
      description: customDescription || 'Two streams become one. A unified video & podcast player that converges YouTube watching and podcast listening into one seamless stream.',
      actionLabel: actionLabel || 'Get Started',
      icon: (
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-stream-unified">
          <path d="M12 2L2 7l10 5 10-5-10-5z"></path>
          <path d="M2 17l10 5 10-5"></path>
          <path d="M2 12l10 5 10-5"></path>
        </svg>
      )},
    channels: {
      title: customTitle || 'No channels found',
      description: customDescription || 'Add channels to start building your unified feed.',
      actionLabel: actionLabel || 'Add Channel',
      icon: (
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-border">
          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
          <circle cx="9" cy="7" r="4"></circle>
          <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
          <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
        </svg>
      )},
    'smart-links': {
      title: customTitle || 'No episode links yet',
      description: customDescription || 'Run the smart linker to automatically match podcast episodes with their YouTube video counterparts.',
      actionLabel: actionLabel || 'Run Matching',
      icon: (
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-border">
          <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path>
          <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path>
        </svg>
      )},
    default: {
      title: customTitle || 'Nothing here',
      description: customDescription || 'Nothing to show.',
      actionLabel: actionLabel || 'Action',
      icon: (
        <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-border">
          <circle cx="12" cy="12" r="10"></circle>
        </svg>
      )},
  };

  const config = configs[variant] || configs.default;
  const title = customTitle || config.title;
  const description = customDescription || config.description;
  const actionLabelText = actionLabel || config.actionLabel;
  const Icon = config.icon;

  return (
    <div className="flex flex-col items-center justify-center p-12 text-center min-h-[300px]">
      <div className="w-24 h-24 mx-auto mb-6 text-border/50 flex-shrink-0">
        {Icon}
      </div>
      <h3 className="text-xl font-semibold text-text mb-2">{title}</h3>
      <p className="text-text-muted max-w-md mx-auto mb-6">{description}</p>
      {onAction && actionLabelText && (
        <button onClick={onAction} className="btn-unified">
          {actionLabelText}
        </button>
      )}
    </div>
  );
}
