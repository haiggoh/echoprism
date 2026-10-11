interface ChannelCardProps {
  channel: {
    id: string;
    title: string;
    handle?: string;
    thumbnail_url?: string;
    subscriber_count?: number;
    is_subscribed: boolean;
    type?: string;
  };
  onClick?: () => void;
  onSubscribe?: () => void;
}

export function ChannelCard({ channel, onClick, onSubscribe }: ChannelCardProps) {
  return (
    <article 
      className="group bg-surface border border-border rounded-xl overflow-hidden transition-all duration-200 hover:border-border-strong hover:shadow-md"
      onClick={onClick}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <img
            src={channel.thumbnail_url || ''}
            alt=""
            className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
          <div className="min-w-0 flex-1">
            <h3 className="font-medium text-text truncate">{channel.title}</h3>
            {channel.handle && (
              <p className="text-sm text-text-muted truncate">@{channel.handle}</p>
            )}
            <p className="text-sm text-text-muted mt-1">
              {channel.subscriber_count 
                ? `${channel.subscriber_count.toLocaleString()} subscribers`
                : 'Channel'}
            </p>
          </div>
        </div>
        
        <div className="mt-4 flex items-center justify-between">
          <span className="px-2 py-1 text-xs font-medium bg-surface text-text-muted rounded-full capitalize">
            {channel.type || 'video'}
          </span>
          <button
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
              channel.is_subscribed
                ? 'bg-transparent border border-border text-text-muted hover:bg-surface-hover'
                : 'btn-unified'
            }`}
            onClick={(e) => { e.stopPropagation(); onSubscribe?.(); }}
          >
            {channel.is_subscribed ? 'Subscribed' : 'Subscribe'}
          </button>
        </div>
      </div>
    </article>
  );
}
