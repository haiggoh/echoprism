import { EmptyState } from '../ui/EmptyState';

export function DownloadsScreen() {
  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-4 border-b border-border flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text">Downloads</h1>
        <div className="flex gap-2">
          <select className="px-3 py-1.5 bg-surface border border-border rounded-lg text-text">
            <option value="all">All</option>
            <option value="video">Video</option>
            <option value="audio">Audio</option>
          </select>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-4">
        <EmptyState variant="downloads" />
      </div>
    </div>
  );
}
