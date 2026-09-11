'use client';

import { useId } from 'react';

import { cn } from '@/lib/cn';

/**
 * Segmented control.
 *
 * For a small set of mutually exclusive options that live in CLIENT state — a
 * chart range, a view mode, a unit toggle. Anything that should survive a
 * reload or be linkable belongs in the URL and uses `ui/tabs` instead, which is
 * links; this is the one that does not navigate.
 *
 * It is a `radiogroup`, which is what it actually is: N options, one selected.
 * A row of buttons announces as N unrelated actions and gives no way to hear
 * which is active.
 *
 * The selected background is drawn by a single sliding element rather than by
 * a class on the active segment. That is what makes the selection GLIDE between
 * options instead of blinking, and it costs one `transform` — the alternative,
 * animating a background on each of N children, cross-fades two rectangles and
 * always looks like a mistake mid-transition.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  size = 'md',
  className,
}: {
  options: ReadonlyArray<{ value: T; label: string; icon?: React.ReactNode }>;
  value: T;
  onChange: (value: T) => void;
  label: string;
  size?: 'sm' | 'md';
  className?: string;
}) {
  const name = useId();
  const index = Math.max(
    0,
    options.findIndex((option) => option.value === value),
  );

  return (
    <div
      role="radiogroup"
      aria-label={label}
      className={cn(
        'border-line bg-sunken relative inline-flex items-center rounded-full border p-0.5',
        className,
      )}
    >
      {/*
        The travelling pill.

        Width and position are expressed as a fraction of the track, so N
        options need no measurement and no ResizeObserver — the arithmetic is
        the same whether there are two or five. `aria-hidden` because the
        selection is already announced by the radios themselves.
      */}
      <span
        aria-hidden
        className={cn(
          'bg-raised pointer-events-none absolute inset-y-0.5 left-0.5 rounded-full shadow-sm',
          'transition-transform duration-(--duration-slow) ease-(--ease-spring)',
        )}
        style={{
          width: `calc((100% - 0.25rem) / ${options.length})`,
          transform: `translateX(${index * 100}%)`,
        }}
      />

      {options.map((option) => {
        const active = option.value === value;

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            name={name}
            aria-checked={active}
            onClick={() => onChange(option.value)}
            className={cn(
              'relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-full',
              'whitespace-nowrap font-medium transition-colors duration-(--duration-base)',
              'focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-1',
              size === 'sm' ? 'h-7 px-3 text-2xs' : 'h-9 px-4 text-xs',
              active ? 'text-ink' : 'text-muted hover:text-ink',
            )}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
