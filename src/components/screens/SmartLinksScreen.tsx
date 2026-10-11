import { EmptyState } from '../ui/EmptyState';

export function SmartLinksScreen() {
  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-4 border-b border-border flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-text">Smart Links</h1>
        <div className="flex gap-2">
          <button className="btn-unified">Run Matching</button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-4">
        <EmptyState variant="smart-links" />
      </div>
    </div>
  );
}
