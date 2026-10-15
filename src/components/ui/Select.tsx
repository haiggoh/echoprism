import { forwardRef } from 'react';
import { clsx } from 'clsx';
import { ChevronDown, Loader2 } from 'lucide-react';
import { useState, useRef, useEffect } from 'react';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  icon?: React.ReactNode;
}

export interface SelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'onChange'> {
  label?: string;
  error?: string;
  hint?: string;
  options: SelectOption[];
  placeholder?: string;
  clearable?: boolean;
  searchable?: boolean;
  loading?: boolean;
  onChange?: (value: string, option: SelectOption | undefined) => void;
  onSearch?: (query: string) => void;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(
  ({
    label,
    error,
    hint,
    options,
    placeholder,
    clearable = false,
    searchable = false,
    loading = false,
    onChange,
    className = '',
    value,
    onBlur,
    disabled: disabledProp,
    ...props
  }, ref) => {
    const selectId = `select-${Math.random().toString(36).substring(2, 11)}`;
    const [isOpen, setIsOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const selectRef = useRef<HTMLDivElement>(null);

    const filteredOptions = searchable
      ? options.filter((opt) =>
          opt.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
          opt.value.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : options;

    const handleSelectChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
      const selectedOption = options.find((opt) => opt.value === e.target.value);
      onChange?.(e.target.value, selectedOption);
    };

    useEffect(() => {
      const handleClickOutside = (event: MouseEvent) => {
        if (selectRef.current && !selectRef.current.contains(event.target as Node)) {
          setIsOpen(false);
        }
      };
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const handleKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    return (
      <div className={clsx('w-full', className)}>
        {label && (
          <label htmlFor={selectId} className="block text-sm font-medium text-text mb-1.5">
            {label}
          </label>
        )}
        <div className="relative" ref={selectRef}>
          <div className="relative">
            <select
              ref={ref}
              id={selectId}
              className={clsx(
                'w-full px-3 py-2 bg-bg border rounded-md',
                'text-text placeholder-text-muted',
                'transition-colors duration-200',
                'focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent',
                'disabled:bg-surface-hover disabled:text-text-muted disabled:cursor-not-allowed',
                'appearance-none pr-10',
                error && 'border-danger focus:ring-danger focus:border-danger'
              )}
              onChange={handleSelectChange}
              onBlur={onBlur}
              onKeyDown={handleKeyDown}
              disabled={loading || disabledProp}
              aria-invalid={error ? 'true' : 'false'}
              aria-describedby={error ? `${selectId}-error` : hint ? `${selectId}-hint` : undefined}
              {...props}
            >
              {placeholder && (
                <option value="" disabled>
                  {placeholder}
                </option>
              )}
              {options.map((opt) => (
                <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                  {opt.label}
                </option>
              ))}
            </select>

            {loading && (
              <div className="absolute right-3 top-1/2 -translate-y-1/2 text-accent">
                <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
              </div>
            )}

            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-text-muted">
              <ChevronDown className={clsx('w-5 h-5 transition-transform', isOpen && 'rotate-180')} aria-hidden="true" />
            </div>
          </div>

          {searchable && isOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 z-50 bg-surface border border-border rounded-md shadow-pop overflow-hidden">
              <input
                type="text"
                placeholder="Search options..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-3 py-2 bg-bg border-b border-border text-text placeholder-text-muted focus:outline-none"
                autoFocus
              />
              <div className="max-h-60 overflow-auto">
                {filteredOptions.length === 0 ? (
                  <div className="px-3 py-4 text-center text-text-muted text-sm">
                    No options found
                  </div>
                ) : (
                  filteredOptions.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => {
                        onChange?.(opt.value, opt);
                        setIsOpen(false);
                      }}
                      disabled={opt.disabled}
                      className={clsx(
                        'w-full px-3 py-2 text-left text-sm transition-colors',
                        'hover:bg-surface-hover',
                        'focus:outline-none focus:bg-surface-hover',
                        opt.disabled && 'opacity-50 cursor-not-allowed'
                      )}
                    >
                      <span className="flex items-center gap-2">
                        {opt.icon && <span>{opt.icon}</span>}
                        <span>{opt.label}</span>
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
        {error && (
          <p id={`${selectId}-error`} className="mt-1.5 text-sm text-danger flex items-center gap-1" role="alert">
            <span className="w-3 h-3" aria-hidden="true">⚠</span>
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={`${selectId}-hint`} className="mt-1.5 text-sm text-text-muted">
            {hint}
          </p>
        )}
      </div>
    );
  }
);

Select.displayName = 'Select';