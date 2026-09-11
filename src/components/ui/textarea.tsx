'use client';

import type { ComponentProps } from 'react';

import { cn } from '@/lib/cn';

import { Field, controlClasses, controlTone, useField } from './field';

/**
 * Textarea.
 *
 * `field-sizing: content` lets the box grow with what is typed without a
 * ResizeObserver or a mirrored div, and it degrades to a fixed height with a
 * scrollbar where the property is unsupported — which is the correct fallback
 * rather than a broken one.
 *
 * `resize-y` stays available. Taking away the drag handle on a field where
 * someone is composing a reply to a customer is a small cruelty.
 */
function TextareaControl({ className, ...props }: ComponentProps<'textarea'>) {
  const field = useField();

  return (
    <textarea
      id={field.id}
      aria-invalid={field.invalid || undefined}
      aria-describedby={field.describedBy}
      className={cn(
        controlClasses,
        controlTone(field.invalid),
        'min-h-24 resize-y py-2.5 leading-relaxed [field-sizing:content]',
        className,
      )}
      {...props}
    />
  );
}

export interface TextareaProps extends ComponentProps<'textarea'> {
  label: string;
  hint?: string;
  error?: string;
  hideLabel?: boolean;
}

export function Textarea({ label, hint, error, hideLabel, required, ...props }: TextareaProps) {
  return (
    <Field label={label} hint={hint} error={error} hideLabel={hideLabel} required={required}>
      <TextareaControl required={required} {...props} />
    </Field>
  );
}
