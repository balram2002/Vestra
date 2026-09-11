'use client';

import { ChevronDown } from 'lucide-react';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/cn';

import { Field, controlClasses, controlTone, useField } from './field';

/**
 * Select.
 *
 * A NATIVE `<select>`, deliberately.
 *
 * Almost every form in this app is a Server Component posting to a Server
 * Action, so a native control submits its value with no JavaScript at all. It
 * also gets the platform picker — the iOS wheel, the Android sheet, the desktop
 * listbox — which is faster to use, correctly positioned on a small screen, and
 * already accessible. A custom listbox would be several hundred lines
 * reimplementing all of that, and would break the no-JS path.
 *
 * The chevron is ours because the native one cannot be themed; `appearance-none`
 * removes it, and the padding on the right reserves exactly the space the
 * replacement occupies so no option label ever runs underneath it.
 */
function SelectControl({ className, children, ...props }: ComponentProps<'select'>) {
  const field = useField();

  return (
    <div className="relative">
      <select
        id={field.id}
        aria-invalid={field.invalid || undefined}
        aria-describedby={field.describedBy}
        className={cn(
          controlClasses,
          controlTone(field.invalid),
          'h-11 appearance-none pr-9',
          // A native select shows its own text colour for the placeholder
          // option; this keeps the resting state from looking disabled.
          'cursor-pointer',
          className,
        )}
        {...props}
      >
        {children}
      </select>

      <ChevronDown
        className="text-faint pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2"
        aria-hidden
      />
    </div>
  );
}

export interface SelectProps extends ComponentProps<'select'> {
  label: string;
  hint?: string;
  error?: string;
  hideLabel?: boolean;
}

export function Select({ label, hint, error, hideLabel, required, ...props }: SelectProps) {
  return (
    <Field label={label} hint={hint} error={error} hideLabel={hideLabel} required={required}>
      <SelectControl required={required} {...props} />
    </Field>
  );
}
