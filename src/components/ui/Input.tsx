import { forwardRef, useState } from 'react';
import { clsx } from 'clsx';
import { X, Loader2 } from 'lucide-react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  loading?: boolean;
  clearable?: boolean;
  onClear?: () => void;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({
    label,
    error,
    hint,
    leftIcon,
    rightIcon,
    loading = false,
    clearable = false,
    onClear,
    className = '',
    onChange,
    value,
    onBlur,
    ...props
  }, ref) => {
    const inputId = `input-${Math.random().toString(36).substring(2, 11)}`;
    const [showClear, setShowClear] = useState(false);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      setShowClear(clearable && e.target.value.length > 0);
      onChange?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      setTimeout(() => setShowClear(false), 200);
      onBlur?.(e);
    };

    const handleFocus = () => {
      if (clearable && (value as string)?.length > 0) setShowClear(true);
    };

    const handleClear = () => {
      onClear?.();
      onChange?.({ target: { value: '' } } as React.ChangeEvent<HTMLInputElement>);
      setShowClear(false);
    };

    return (
      <div className={clsx('w-full', className)}>
        {label && (
          <label htmlFor={inputId} className="block text-sm font-medium text-text mb-1.5">
            {label}
          </label>
        )}
        <div className="relative">
          {leftIcon && (
            <div className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none">
              {leftIcon}
            </div>
          )}
          <input
            ref={ref}
            id={inputId}
            className={clsx(
              'w-full px-3 py-2 bg-bg border rounded-md',
              'text-text placeholder-text-muted',
              'transition-colors duration-200',
              'focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent',
              'disabled:bg-surface-hover disabled:text-text-muted disabled:cursor-not-allowed',
              error && 'border-danger focus:ring-danger focus:border-danger',
              leftIcon && 'pl-10',
              (rightIcon || clearable || loading) && 'pr-10'
            )}
            onChange={handleChange}
            onBlur={handleBlur}
            onFocus={handleFocus}
            aria-invalid={error ? 'true' : 'false'}
            aria-describedby={error ? `${inputId}-error` : hint ? `${inputId}-hint` : undefined}
            {...props}
          />
          {loading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-accent">
              <Loader2 className="w-5 h-5 animate-spin" aria-hidden="true" />
            </div>
          )}
          {clearable && showClear && !loading && (
            <button
              type="button"
              onClick={handleClear}
              className="absolute right-3 top-1/2 -translate-y-1/2 p-1 text-text-muted hover:text-text transition-colors"
              aria-label="Clear"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          )}
          {rightIcon && !clearable && !loading && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none">
              {rightIcon}
            </div>
          )}
        </div>
        {error && (
          <p id={`${inputId}-error`} className="mt-1.5 text-sm text-danger flex items-center gap-1" role="alert">
            <span className="w-3 h-3" aria-hidden="true">⚠</span>
            {error}
          </p>
        )}
        {hint && !error && (
          <p id={`${inputId}-hint`} className="mt-1.5 text-sm text-text-muted">
            {hint}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = 'Input';