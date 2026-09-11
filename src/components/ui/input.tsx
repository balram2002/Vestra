'use client';

import type { ComponentProps } from 'react';

import { cn } from '@/lib/cn';

import { Field, controlClasses, controlTone, useField } from './field';

/**
 * Text field.
 *
 * Label, hint and error come from `<Field>` rather than being wired up here, so
 * every control in the system — input, select, textarea — gets the same
 * `htmlFor`, the same `aria-describedby`, the same `aria-invalid`, and the same
 * rule that hint text lives OUTSIDE the `<label>`. A form that composes those
 * by hand gets it right on the first field and wrong on the fifth.
 *
 * `leading` and `trailing` are slots rather than something the caller fakes
 * with absolute positioning, because the padding that keeps text from running
 * under an adornment has to move with it.
 */
function InputControl({
  className,
  leading,
  trailing,
  ...props
}: ComponentProps<'input'> & { leading?: React.ReactNode; trailing?: React.ReactNode }) {
  const field = useField();
  // A text prefix such as "+91" is wider than an icon, so it gets its own
  // width and more padding; an icon or a single symbol keeps the 16px slot.
  const textPrefix = typeof leading === 'string' && leading.length > 1;

  const control = (
    <input
      id={field.id}
      aria-invalid={field.invalid || undefined}
      aria-describedby={field.describedBy}
      className={cn(
        controlClasses,
        controlTone(field.invalid),
        'h-11',
        leading && (textPrefix ? 'pl-12' : 'pl-9'),
        trailing && 'pr-9',
        className,
      )}
      {...props}
    />
  );

  if (!leading && !trailing) return control;

  return (
    <div className="relative">
      {leading ? (
        <span
          className={cn(
            'text-faint pointer-events-none absolute left-3 top-1/2 -translate-y-1/2',
            textPrefix ? 'tabular text-sm' : 'grid size-4 place-items-center',
          )}
          aria-hidden
        >
          {leading}
        </span>
      ) : null}

      {control}

      {trailing ? (
        <span className="text-faint absolute right-3 top-1/2 grid size-4 -translate-y-1/2 place-items-center">
          {trailing}
        </span>
      ) : null}
    </div>
  );
}

export interface InputProps extends Omit<ComponentProps<'input'>, 'id'> {
  label: string;
  hint?: string;
  error?: string;
  /** Visually hide the label but keep it for assistive tech. */
  hideLabel?: boolean;
  /** Icon or symbol inside the leading edge — a search glass, a ₹. */
  leading?: React.ReactNode;
  trailing?: React.ReactNode;
}

export function Input({
  label,
  hint,
  error,
  hideLabel = false,
  leading,
  trailing,
  required,
  className,
  ...props
}: InputProps) {
  return (
    <Field label={label} hint={hint} error={error} hideLabel={hideLabel} required={required}>
      <InputControl
        required={required}
        leading={leading}
        trailing={trailing}
        className={className}
        {...props}
      />
    </Field>
  );
}
