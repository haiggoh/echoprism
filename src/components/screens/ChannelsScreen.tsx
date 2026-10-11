import { EmptyState } from '../ui/EmptyState';

export function ChannelsScreen() {
  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-4 border-b border-border flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text">Channels</h1>
        <button className="btn-unified">Add Channel</button>
      </div>
      <div className="flex-1 overflow-auto p-4">
        <EmptyState variant="channels" />
      </div>
    </div>
  );
}
