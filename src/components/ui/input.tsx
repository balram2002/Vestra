import type { ComponentProps } from 'react';
import { useId } from 'react';

import { cn } from '@/lib/cn';

/**
 * Text field.
 *
 * Label, hint and error are part of the component rather than left to each
 * form, because that is what guarantees they are actually wired up: the label
 * gets a real `htmlFor`, the error gets an id referenced by `aria-describedby`,
 * and `aria-invalid` is set. A form that composes these by hand gets it right
 * on the first field and wrong on the fifth.
 */
export interface InputProps extends Omit<ComponentProps<'input'>, 'id'> {
  label: string;
  hint?: string;
  error?: string;
  /** Visually hide the label but keep it for assistive tech. */
  hideLabel?: boolean;
}

export function Input({
  label,
  hint,
  error,
  hideLabel = false,
  className,
  required,
  ...props
}: InputProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  return (
    <div className="w-full">
      <label
        htmlFor={id}
        className={cn(
          'text-ink mb-1.5 block text-xs font-medium',
          hideLabel && 'sr-only',
        )}
      >
        {label}
        {required ? (
          <span className="text-danger-600 ml-0.5" aria-hidden>
            *
          </span>
        ) : null}
      </label>

      <input
        id={id}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={cn(hint && hintId, error && errorId) || undefined}
        className={cn(
          'bg-raised text-ink placeholder:text-faint h-10 w-full rounded-md border px-3 text-sm',
          'transition-[border-color,box-shadow]',
          error
            ? 'border-danger-500 focus:border-danger-600'
            : 'border-line-strong focus:border-accent-line',
          'disabled:bg-sunken disabled:cursor-not-allowed',
          className,
        )}
        {...props}
      />

      {hint && !error ? (
        <p id={hintId} className="text-faint mt-1 text-2xs">
          {hint}
        </p>
      ) : null}

      {error ? (
        <p id={errorId} role="alert" className="text-danger-600 mt-1 text-2xs">
          {error}
        </p>
      ) : null}
    </div>
  );
}
