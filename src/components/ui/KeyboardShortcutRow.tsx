import { clsx } from 'clsx';
import { X, Edit2, RotateCcw } from 'lucide-react';
import { useState } from 'react';

export interface KeyboardShortcutRowProps {
  variant?: 'category' | 'shortcut';
  category?: string;
  action?: string;
  keyCombination?: string;
  context?: 'global' | 'player' | 'queue' | 'feed';
  enabled?: boolean;
  isCustom?: boolean;
  onEdit?: () => void;
  onDelete?: () => void;
  onReset?: () => void;
  isEditing?: boolean;
  onSave?: (key: string) => void;
  onCancel?: () => void;
  className?: string;
}

const formatKey = (key: string): string => {
  return key
    .split('+')
    .map((k) => {
      switch (k.toLowerCase()) {
        case 'ctrl':
        case 'control':
          return '⌃';
        case 'cmd':
        case 'meta':
          return '⌘';
        case 'alt':
        case 'option':
          return '⌥';
        case 'shift':
          return '⇧';
        case 'enter':
          return '↵';
        case 'escape':
        case 'esc':
          return '⎋';
        case 'space':
          return 'Space';
        case 'arrowup':
          return '↑';
        case 'arrowdown':
          return '↓';
        case 'arrowleft':
          return '←';
        case 'arrowright':
          return '→';
        case 'backspace':
          return '⌫';
        case 'delete':
          return 'Del';
        case 'tab':
          return 'Tab';
        case 'capslock':
          return '⇪';
        default:
          return k.toUpperCase();
      }
    })
    .join(' + ');
};

export const KeyboardShortcutRow = ({
  variant = 'shortcut',
  category,
  action,
  keyCombination,
  context = 'global',
  enabled = true,
  isCustom = false,
  onEdit,
  onDelete,
  onReset,
  isEditing = false,
  onSave,
  onCancel,
  className = '',
}: KeyboardShortcutRowProps) => {
  const [editKey, setEditKey] = useState('');

  if (variant === 'category') {
    return (
      <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-text-muted border-b border-border">
        {category}
      </div>
    );
  }

  if (!action || !keyCombination) return null;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isEditing) return;
    e.preventDefault();
    const parts = [];
    if (e.metaKey || e.ctrlKey) parts.push(e.metaKey ? 'Meta' : 'Control');
    if (e.altKey) parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    if (e.key !== 'Control' && e.key !== 'Alt' && e.key !== 'Shift' && e.key !== 'Meta') {
      parts.push(e.key);
    }
    const newKey = parts.join('+');
    setEditKey(newKey);
    if (onSave) onSave(newKey);
  };

  const handleBlur = () => {
    if (isEditing && editKey && onSave) {
      onSave(editKey);
    }
  };

  return (
    <div
      className={clsx(
        'flex items-center gap-3 px-3 py-2 rounded-md transition-colors',
        'hover:bg-surface-hover',
        enabled ? '' : 'opacity-50',
        className
      )}
    >
      <div className="flex-1 min-w-0 flex items-center gap-3">
        <span className="text-text-muted text-sm w-20 flex-shrink-0 capitalize">{context}</span>
        <span className="font-medium text-text truncate flex-1">{action}</span>
        {isCustom && (
          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 text-[10px] font-medium rounded-full bg-accent-soft text-accent border border-accent">
            <RotateCcw className="w-2.5 h-2.5" aria-hidden="true" />
            Custom
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        {isEditing ? (
          <div className="relative">
            <input
              type="text"
              value={editKey || formatKey(keyCombination)}
              onChange={(e) => setEditKey(e.target.value)}
              onKeyDown={handleKeyDown}
              onBlur={handleBlur}
              autoFocus
              className="px-2 py-1 text-sm font-mono bg-surface border border-accent rounded focus:outline-none focus:ring-2 focus:ring-accent min-w-[120px]"
              placeholder="Press keys..."
              aria-label="Edit shortcut"
            />
            <button
              type="button"
              onClick={() => onCancel?.()}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text"
              aria-label="Cancel"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        ) : (
          <>
            <kbd className={clsx(
              'inline-flex items-center gap-1 px-2 py-1 text-xs font-mono bg-surface border border-border rounded',
              'transition-colors',
              enabled ? 'text-text' : 'text-text-muted'
            )}>
              {formatKey(keyCombination)}
            </kbd>
            {onEdit && (
              <button
                type="button"
                onClick={() => { setEditKey(''); onEdit?.(); }}
                className="p-1 rounded text-text-muted hover:text-accent transition-colors"
                aria-label="Edit shortcut"
              >
                <Edit2 className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
            {isCustom && onReset && (
              <button
                type="button"
                onClick={onReset}
                className="p-1 rounded text-text-muted hover:text-danger transition-colors"
                aria-label="Reset to default"
              >
                <RotateCcw className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
            {onDelete && (
              <button
                type="button"
                onClick={onDelete}
                className="p-1 rounded text-text-muted hover:text-danger transition-colors"
                aria-label="Delete shortcut"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

KeyboardShortcutRow.displayName = 'KeyboardShortcutRow';