import { EmptyState } from '../ui/EmptyState';

export function HistoryScreen() {
  return (
    <div className="h-full flex flex-col">
      <div className="px-4 py-4 border-b border-border">
        <h1 className="text-2xl font-semibold text-text">History</h1>
      </div>
      <div className="flex-1 overflow-auto p-4">
        <EmptyState variant="history" />
      </div>
    </div>
  );
}
