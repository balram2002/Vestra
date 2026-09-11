'use client';

import { createContext, useContext, useId } from 'react';

import { cn } from '@/lib/cn';

/**
 * The label / hint / error scaffold every form control shares.
 *
 * Wiring these up correctly is four things — `htmlFor`, an `id` on the hint, an
 * `id` on the error, `aria-describedby` pointing at whichever exist, and
 * `aria-invalid` — and a form that composes them by hand gets it right on the
 * first field and wrong on the fifth. So the control asks the field for its ids
 * rather than inventing them.
 *
 * One rule this encodes, learned the hard way in Phase 14: **hint text lives
 * OUTSIDE the `<label>`.** Nesting it folds it into the accessible name, and the
 * guest email field announced as "Email Your order confirmation and tracking go
 * here" — a name nobody can match against what they were asked for.
 */

interface FieldContext {
  id: string;
  hintId: string;
  errorId: string;
  invalid: boolean;
  describedBy: string | undefined;
}

const Ctx = createContext<FieldContext | null>(null);

export function useField(): FieldContext {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error('A field control must be rendered inside <Field>.');
  return ctx;
}

export interface FieldProps {
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  /** Visually hide the label but keep it for assistive tech. */
  hideLabel?: boolean;
  className?: string;
  children: React.ReactNode;
}

export function Field({
  label,
  hint,
  error,
  required,
  hideLabel = false,
  className,
  children,
}: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;

  const describedBy = cn(hint && hintId, error && errorId) || undefined;

  return (
    <Ctx.Provider value={{ id, hintId, errorId, invalid: Boolean(error), describedBy }}>
      <div className={cn('w-full', className)}>
        <label
          htmlFor={id}
          className={cn(
            'text-ink mb-2 block text-xs font-semibold tracking-[0.01em]',
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

        {children}

        {/*
          The hint disappears while an error is showing rather than stacking
          beneath it. Two lines of guidance under one field is where people stop
          reading, and the error is the one that matters right now.
        */}
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
    </Ctx.Provider>
  );
}

/**
 * The shared shape of a text-like control.
 *
 * `border-line-control` rather than `border-line`: an input's edge is the
 * visual boundary that identifies it as a control, which WCAG 1.4.11 holds to
 * 3:1. The decorative hairline used for dividers measured 1.56:1 and was what
 * every input in all three apps used before Phase 24.
 */
export const controlClasses = [
  'bg-raised text-ink placeholder:text-faint w-full rounded-lg border px-3.5 text-sm',
  'transition-[border-color,background-color,box-shadow] duration-(--duration-base) ease-(--ease-out)',
  'disabled:bg-sunken disabled:cursor-not-allowed disabled:opacity-70',
  /*
   * A hair of inset shadow at rest.
   *
   * A field is a HOLE in the surface, not a tile on top of it, and one inset
   * hairline is the whole difference between a control that invites typing and
   * a grey rectangle. It is removed on focus, where the ring takes over — two
   * depth cues at once reads as a mistake.
   */
  'shadow-[inset_0_1px_1px_0_var(--elevation-1)] focus:shadow-none',
  /*
   * The same mobile floor the buttons carry. A 40px select is under the touch
   * minimum, and a form is the last place to make somebody aim.
   */
  'min-h-11 lg:min-h-0',
] as const;

/**
 * The border and the focus ring, which move together.
 *
 * The ring is on `:focus`, not `:focus-visible`, and that is deliberate — it is
 * the opposite of the rule for buttons. Clicking into a text field is a
 * deliberate act of "I am typing HERE", and the field needs to say so whether
 * the pointer or the keyboard put the caret there. A button, by contrast, is
 * pressed and released, so a persistent mouse-focus ring on it is just noise.
 *
 * `ring` rather than a thicker border: a border that grows from 1px to 2px on
 * focus changes the control's box and nudges every neighbour by a pixel. The
 * ring is painted outside the box and moves nothing.
 */
export function controlTone(invalid: boolean): string {
  return invalid
    ? 'border-danger-500 focus:border-danger-600 focus:ring-4 focus:ring-danger-500/15'
    : 'border-line-control hover:border-line-bold focus:border-accent-control focus:ring-4 focus:ring-accent/15';
}
