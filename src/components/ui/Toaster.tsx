import { useState, useCallback, useEffect } from 'react';

interface Toast {
  id: string;
  title: string;
  description?: string;
  variant?: 'default' | 'success' | 'warning' | 'danger';
  duration?: number;
}

let toastStore: { toasts: Toast[] } = { toasts: [] };
let listeners: Array<() => void> = [];

function notify() {
  listeners.forEach(listener => listener());
}

export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>(toastStore.toasts);

  useEffect(() => {
    // Subscribe to the module-level toast store so this hook re-renders on notify()
    const listener = () => setToasts([...toastStore.toasts]);
    listeners.push(listener);
    return () => {
      listeners = listeners.filter(l => l !== listener);
    };
  }, []);

  const addToast = useCallback((toast: Omit<Toast, 'id'>) => {
    const id = Math.random().toString(36).slice(2);
    const newToast = { ...toast, id };
    toastStore.toasts = [...toastStore.toasts, newToast];
    notify();
    // Auto-dismiss unless the caller chose a duration
    setTimeout(() => {
      toastStore.toasts = toastStore.toasts.filter(t => t.id !== id);
      notify();
    }, toast.duration ?? 5000);
  }, []);

  const removeToast = useCallback((id: string) => {
    toastStore.toasts = toastStore.toasts.filter(t => t.id !== id);
    notify();
  }, []);

  return { toasts, addToast, removeToast };
}

export function Toaster() {
  const { toasts, removeToast } = useToasts();
  
  if (toasts.length === 0) return null;
  
  return (
    <div className="fixed bottom-4 right-4 z-[800] flex flex-col gap-2 w-80">
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
      ))}
    </div>
  );
}

function ToastItem({ toast, onClose }: { toast: { id: string; title: string; description?: string; variant?: string }; onClose: () => void }) {
  const variantStyles = {
    default: 'bg-surface border border-border',
    success: 'bg-success-soft border border-success',
    warning: 'bg-warning-soft border border-warning',
    danger: 'bg-danger-soft border border-danger',
  };
  
  return (
    <div className={`flex items-start gap-3 p-4 rounded-lg shadow-lg shadow-black/50 animate-in animate-slide-in-from-right ${variantStyles[toast.variant as keyof typeof variantStyles] || variantStyles.default}`}>
      <div className="flex-1 min-w-0">
        <p className="font-medium text-text">{toast.title}</p>
        {toast.description && <p className="text-sm text-text-muted mt-1">{toast.description}</p>}
      </div>
      <button 
        onClick={onClose}
        className="text-text-muted hover:text-text p-1 rounded hover:bg-surface-hover transition-colors"
        aria-label="Dismiss"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18"></line>
          <line x1="6" y1="6" x2="18" y2="18"></line>
        </svg>
      </button>
    </div>
  );
}
