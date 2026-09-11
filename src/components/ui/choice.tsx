import { Check, Minus } from 'lucide-react';
import type { ComponentProps } from 'react';
import { useId } from 'react';

import { cn } from '@/lib/cn';

/**
 * Checkbox, radio and switch.
 *
 * All three are a NATIVE input styled with `appearance-none`, not a Radix
 * primitive with a hidden input behind it. The reason is the one that also
 * chose a native `<select>`: these controls live in forms that post to Server
 * Actions, so a native input submits its value with no JavaScript, arrives
 * pre-wired to its label, and already has the right keyboard behaviour — space
 * toggles, arrows move within a radio group.
 *
 * Two structural rules make it work, and breaking either one fails silently:
 *
 *  1. The input FILLS THE ROW, not the 18px box it draws. Sizing it to the box
 *     made the real hit area 18x18 while the row around it was 44px tall and
 *     looked like the target — `audit-layout.mjs` measured exactly that.
 *     Stretching it means the words are part of the control, which is what
 *     everyone already assumes when they tap a label.
 *
 *  2. The drawn mark is a DIRECT SIBLING of the input. `peer-checked:` only ever
 *     matches a later sibling, so a mark nested one level deeper never receives
 *     the checked state and the tick simply never appears. Anything inside the
 *     mark is addressed from the mark (`peer-checked:[&>svg]:…`) rather than
 *     carrying `peer-` classes of its own.
 */

interface ChoiceProps extends Omit<ComponentProps<'input'>, 'type' | 'id'> {
  label: React.ReactNode;
  /** Secondary line under the label. Rendered outside the accessible name. */
  description?: React.ReactNode;
  className?: string;
}

/** The row. `relative` gives the stretched input something to fill. */
const ROW = [
  'relative flex w-full cursor-pointer items-start gap-3 rounded-md py-2 text-left',
  'has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60',
] as const;

const INPUT =
  'peer absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed';

/** The drawn box. Direct sibling of the input, so `peer-checked:` reaches it. */
const MARK = [
  'pointer-events-none relative mt-0.5 grid size-[18px] shrink-0 place-items-center border',
  'transition-[background-color,border-color] duration-(--duration-fast) ease-(--ease-out)',
  'border-line-control bg-raised',
  'peer-checked:bg-accent peer-checked:border-accent',
  'peer-focus-visible:outline-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2',
  'peer-disabled:bg-sunken',
] as const;

const TEXT = 'pointer-events-none min-w-0 flex-1';

export function Checkbox({ label, description, className, ...props }: ChoiceProps) {
  const id = useId();
  const descriptionId = description ? `${id}-description` : undefined;

  return (
    <label htmlFor={id} className={cn(ROW, className)}>
      <input id={id} type="checkbox" aria-describedby={descriptionId} className={INPUT} {...props} />

      <span
        className={cn(
          MARK,
          'rounded-xs',
          '[&>svg]:scale-50 [&>svg]:opacity-0',
          '[&>svg]:transition-[opacity,transform] [&>svg]:duration-(--duration-fast)',
          'peer-checked:[&>svg]:scale-100 peer-checked:[&>svg]:opacity-100',
        )}
        aria-hidden
      >
        <Check className="text-on-accent size-3" strokeWidth={3} />
      </span>

      <span className={TEXT}>
        <span className="text-ink block text-sm leading-snug">{label}</span>
        {description ? (
          <span id={descriptionId} className="text-muted mt-0.5 block text-xs">
            {description}
          </span>
        ) : null}
      </span>
    </label>
  );
}

/**
 * A "select all" that is only partly selected.
 *
 * Separate from `Checkbox` because `indeterminate` is a DOM property with no
 * HTML attribute — it can only be set imperatively — and a box that draws a dash
 * while reporting `checked: false` to assistive tech is telling two stories.
 * This one states `aria-checked="mixed"`, which is what it looks like.
 */
export function CheckboxMixed({ label, className, ...props }: ChoiceProps) {
  const id = useId();

  return (
    <label htmlFor={id} className={cn(ROW, className)}>
      <input id={id} type="checkbox" aria-checked="mixed" className={INPUT} {...props} />

      <span className={cn(MARK, 'bg-accent border-accent rounded-xs')} aria-hidden>
        <Minus className="text-on-accent size-3" strokeWidth={3} />
      </span>

      <span className={TEXT}>
        <span className="text-ink block text-sm leading-snug">{label}</span>
      </span>
    </label>
  );
}

export function Radio({ label, description, className, ...props }: ChoiceProps) {
  const id = useId();
  const descriptionId = description ? `${id}-description` : undefined;

  return (
    <label htmlFor={id} className={cn(ROW, className)}>
      <input id={id} type="radio" aria-describedby={descriptionId} className={INPUT} {...props} />

      <span
        className={cn(
          MARK,
          'rounded-full',
          '[&>span]:scale-0 [&>span]:transition-transform [&>span]:duration-(--duration-fast)',
          'peer-checked:[&>span]:scale-100',
        )}
        aria-hidden
      >
        <span className="bg-on-accent size-1.5 rounded-full" />
      </span>

      <span className={TEXT}>
        <span className="text-ink block text-sm leading-snug">{label}</span>
        {description ? (
          <span id={descriptionId} className="text-muted mt-0.5 block text-xs">
            {description}
          </span>
        ) : null}
      </span>
    </label>
  );
}

/**
 * Switch.
 *
 * `role="switch"` on a native checkbox, which is what the ARIA spec intends:
 * the semantics read on/off rather than checked/unchecked, and the control
 * underneath is still something a form can submit.
 *
 * The row is the target here too — the track is 44x24, which passes on width
 * and fails on height, and nobody aims at a 24px strip.
 *
 * The knob moves with `translate-x`, never `left`, so it composites instead of
 * laying out on every frame.
 */
export function Switch({ label, description, className, ...props }: ChoiceProps) {
  const id = useId();
  const descriptionId = description ? `${id}-description` : undefined;

  return (
    <label
      htmlFor={id}
      className={cn(
        'relative flex w-full cursor-pointer items-center justify-between gap-4 py-2',
        'has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60',
        className,
      )}
    >
      <input
        id={id}
        type="checkbox"
        role="switch"
        aria-describedby={descriptionId}
        className={INPUT}
        {...props}
      />

      {/*
        The track and knob are two siblings of the input rather than one nested
        pair, because both react to `peer-checked:` and a `peer-` variant only
        matches a later SIBLING.
      */}
      <span
        className={cn(
          'pointer-events-none order-2 relative h-6 w-11 shrink-0 rounded-full border',
          'transition-colors duration-(--duration-base) ease-(--ease-out)',
          'border-line-control bg-sunken',
          'peer-checked:bg-accent peer-checked:border-accent',
          'peer-focus-visible:outline-accent peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2',
          '[&>span]:transition-transform [&>span]:duration-(--duration-base)',
          'peer-checked:[&>span]:translate-x-5',
        )}
        aria-hidden
      >
        <span className="bg-raised absolute left-0.5 top-0.5 size-5 rounded-full shadow-sm" />
      </span>

      <span className="pointer-events-none order-1 min-w-0">
        <span className="text-ink block text-sm font-medium leading-snug">{label}</span>
        {description ? (
          <span id={descriptionId} className="text-muted mt-0.5 block text-xs">
            {description}
          </span>
        ) : null}
      </span>
    </label>
  );
}
