'use client';

import { Minus, Plus } from 'lucide-react';
import { useId } from 'react';

import { cn } from '@/lib/cn';

/**
 * Quantity stepper.
 *
 * The control that decides how much money changes hands, so it is built around
 * the two things that go wrong with it:
 *
 *  1. **It must be typeable.** A pair of ± buttons alone means going from 1 to
 *     12 is eleven taps. There is a real `<input type="number">` in the middle,
 *     and it is the labelled control — the buttons are `aria-hidden` helpers
 *     that adjust it. That is why there is one accessible name here and not
 *     three.
 *  2. **It must never let an invalid quantity be submitted.** The buttons
 *     disable at the bounds rather than clamping silently after the fact,
 *     because a control that accepts a tap and then quietly refuses it reads as
 *     broken. `max` is the real available stock, so the upper bound is a fact
 *     about the world rather than an arbitrary cap.
 *
 * The value is CONTROLLED. A stepper next to a server-backed bag has exactly
 * one source of truth, and it is not this component — holding internal state
 * here is how the number on screen and the number in the bag drift apart while
 * a mutation is in flight.
 */
export function Stepper({
  value,
  onChange,
  min = 1,
  max = 99,
  label = 'Quantity',
  size = 'md',
  disabled = false,
  className,
}: {
  value: number;
  onChange: (next: number) => void;
  min?: number;
  max?: number;
  label?: string;
  size?: 'sm' | 'md';
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();

  const clamp = (next: number) => Math.max(min, Math.min(max, next));
  const set = (next: number) => {
    if (Number.isNaN(next)) return;
    const bounded = clamp(next);
    if (bounded !== value) onChange(bounded);
  };

  const small = size === 'sm';
  const button = cn(
    'grid shrink-0 place-items-center rounded-full text-ink',
    'transition-[background-color,transform] duration-(--duration-fast) ease-(--ease-out)',
    'hover:bg-sunken motion-safe:active:scale-90',
    'disabled:pointer-events-none disabled:text-faint',
    'focus-visible:outline-accent focus-visible:outline-2 focus-visible:-outline-offset-2',
    small ? 'size-8' : 'size-10',
  );

  return (
    <div
      className={cn(
        'border-line-control bg-raised inline-flex items-center rounded-full border',
        small ? 'h-9 px-0.5' : 'h-11 px-1',
        disabled && 'pointer-events-none opacity-60',
        className,
      )}
    >
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        disabled={value <= min}
        onClick={() => set(value - 1)}
        className={button}
      >
        <Minus className={small ? 'size-3.5' : 'size-4'} />
      </button>

      <label htmlFor={id} className="sr-only">
        {label}
      </label>
      <input
        id={id}
        type="number"
        inputMode="numeric"
        value={value}
        min={min}
        max={max}
        step={1}
        onChange={(event) => set(Number.parseInt(event.target.value, 10))}
        /*
         * Re-clamp on blur, not on every keystroke.
         *
         * Clamping as they type makes it impossible to clear the field and
         * retype: deleting the "1" from "12" yields "1", which is instantly
         * valid, so the caret fights the user. On blur the field settles to
         * something legal exactly once.
         */
        onBlur={(event) => {
          const parsed = Number.parseInt(event.target.value, 10);
          set(Number.isNaN(parsed) ? min : parsed);
        }}
        aria-label={label}
        className={cn(
          'tabular border-0 bg-transparent text-center font-medium outline-none',
          'text-ink [appearance:textfield]',
          small ? 'w-7 text-xs' : 'w-9 text-sm',
        )}
      />

      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        disabled={value >= max}
        onClick={() => set(value + 1)}
        className={button}
      >
        <Plus className={small ? 'size-3.5' : 'size-4'} />
      </button>
    </div>
  );
}
