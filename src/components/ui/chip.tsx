import Link from 'next/link';
import { Check, X } from 'lucide-react';
import type { ComponentProps } from 'react';

import { cn } from '@/lib/cn';

/**
 * Chip.
 *
 * The small, pressable pill that carries a CHOICE: an applied filter, a size, a
 * colour, a saved search, a quick-pick category. Distinct from `Badge`, which
 * is a readout and never pressable — mixing the two is how a status pill ends
 * up looking like a button nobody can press.
 *
 * Three forms, one look:
 *
 *   ChipLink     navigates. The default for anything that belongs in the URL,
 *                which is every filter in this codebase.
 *   ChipButton   toggles client state. For a size or colour picker inside a
 *                form, where there is no URL to change.
 *   ChipRemove   an applied filter with its own dismiss.
 *
 * `aria-current="page"` on the link form and `aria-pressed` on the button form,
 * and the distinction is load-bearing: a link GOES somewhere, so "current" is
 * the honest word; a button changes state in place, so "pressed" is. Using
 * `aria-pressed` on a navigation chip promises a toggle that never happens.
 */

const CHIP = [
  'group/chip relative inline-flex shrink-0 items-center justify-center gap-1.5',
  'whitespace-nowrap rounded-full border text-xs font-medium',
  'transition-[background-color,border-color,color,transform] duration-(--duration-base) ease-(--ease-out)',
  'motion-safe:active:scale-[0.96]',
  'focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-2',
  // 44px while a thumb drives it, dense once a pointer does. A chip labelled
  // "S" is 30px wide, which passes on height and fails a finger — so the
  // minimum has to cover both axes.
  'min-h-11 min-w-11 px-3.5 lg:min-h-8.5 lg:min-w-0',
] as const;

const REST = 'bg-raised border-line-control text-muted hover:border-line-bold hover:text-ink';

/**
 * The selected state.
 *
 * Near-black rather than the brand colour, and that is deliberate: a page can
 * carry a dozen selected chips at once, and a dozen indigo pills competes with
 * the one indigo button that is actually the next step. Ink recedes into the
 * type hierarchy while still reading unmistakably as "on".
 */
const ON = 'bg-ink border-ink text-canvas hover:bg-ink';

const OFF_DISABLED =
  'bg-sunken border-line text-faint line-through cursor-not-allowed pointer-events-none';

export function ChipLink({
  href,
  active = false,
  className,
  children,
  ...props
}: { href: string; active?: boolean } & Omit<ComponentProps<typeof Link>, 'href'>) {
  return (
    <Link
      href={href}
      aria-current={active ? 'page' : undefined}
      className={cn(CHIP, active ? ON : REST, className)}
      {...props}
    >
      {children}
    </Link>
  );
}

export function ChipButton({
  active = false,
  unavailable = false,
  /** Show a tick when selected. For multi-select facets, where "on" is a state. */
  showCheck = false,
  className,
  children,
  ...props
}: {
  active?: boolean;
  unavailable?: boolean;
  showCheck?: boolean;
} & ComponentProps<'button'>) {
  return (
    <button
      type="button"
      aria-pressed={active}
      /*
       * `aria-disabled` rather than `disabled`.
       *
       * An out-of-stock size must stay focusable and announceable — "Size 32,
       * unavailable" is information a shopper needs. A truly `disabled` button
       * is skipped by the keyboard entirely, so the one fact the chip exists to
       * convey never reaches anyone browsing by keyboard.
       */
      aria-disabled={unavailable || undefined}
      className={cn(CHIP, unavailable ? OFF_DISABLED : active ? ON : REST, className)}
      {...props}
    >
      {showCheck && active ? <Check className="size-3.5 shrink-0" aria-hidden /> : null}
      {children}
    </button>
  );
}

/**
 * An applied filter, with its own dismiss.
 *
 * The WHOLE chip is the remove control rather than a label with a tiny × beside
 * it: a 12px glyph inside a 30px pill is a target nobody hits on the first try,
 * and there is nothing else the chip could possibly do.
 */
export function ChipRemove({
  href,
  label,
  value,
  className,
}: {
  href: string;
  /** The facet, e.g. "Colour". Read by assistive tech, hidden visually. */
  label: string;
  value: string;
  className?: string;
}) {
  return (
    <Link
      href={href}
      aria-label={`Remove filter ${label}: ${value}`}
      className={cn(
        CHIP,
        'bg-accent-soft border-accent-line text-accent-ink hover:border-accent-control',
        'pr-2.5',
        className,
      )}
    >
      {value}
      <X
        className="size-3.5 opacity-60 transition-opacity duration-(--duration-fast) group-hover/chip:opacity-100"
        aria-hidden
      />
    </Link>
  );
}

/**
 * A colour swatch chip.
 *
 * The colour IS the content, so the accessible name has to carry the word —
 * "Indigo" — and never the hex. The ring rather than a border: a border changes
 * the swatch's size when it thickens on selection, and a ring is drawn outside
 * the box so the colour area stays constant while the selection state changes.
 */
export function ChipSwatch({
  hex,
  label,
  active = false,
  unavailable = false,
  className,
  ...props
}: {
  hex: string;
  label: string;
  active?: boolean;
  unavailable?: boolean;
} & ComponentProps<'button'>) {
  return (
    <button
      type="button"
      aria-pressed={active}
      aria-disabled={unavailable || undefined}
      aria-label={unavailable ? `${label}, unavailable` : label}
      title={label}
      className={cn(
        'relative grid size-11 shrink-0 place-items-center rounded-full',
        'transition-transform duration-(--duration-base) ease-(--ease-out)',
        'motion-safe:active:scale-90',
        'focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-2',
        unavailable && 'cursor-not-allowed opacity-40',
        className,
      )}
      {...props}
    >
      <span
        aria-hidden
        style={{ backgroundColor: hex }}
        className={cn(
          'size-6.5 rounded-full transition-transform duration-(--duration-base) ease-(--ease-out)',
          // Two rings: a hairline that keeps a white swatch visible on white,
          // and the selection ring drawn outside it.
          'ring-1 ring-inset ring-black/15',
          'outline-offset-[3px]',
          active ? 'outline-2 outline-ink' : 'outline-0',
          !unavailable && 'motion-safe:group-hover:scale-105',
        )}
      />
      {unavailable ? (
        <span aria-hidden className="bg-line-bold absolute h-px w-7 rotate-45 rounded-full" />
      ) : null}
    </button>
  );
}

/**
 * A row of chips that scrolls horizontally on a phone and wraps on a desktop.
 *
 * This exists because the combination is subtle and got written differently
 * three times: the row must bleed to the viewport edge so the last chip is
 * visibly cut (which is what tells a shopper there is more), it must not snap
 * (a filter row that snaps fights the thumb), and it must stop scrolling
 * entirely once there is room to wrap.
 */
export function ChipRow({ className, children, ...props }: ComponentProps<'div'>) {
  return (
    <div
      className={cn(
        'no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4',
        'sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}
