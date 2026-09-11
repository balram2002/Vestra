import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/cn';

/**
 * Empty state.
 *
 * A designed state, not an afterthought. Three things it must do, and the
 * reason each one is a prop rather than a convention:
 *
 *  - say what is empty in the user's words, not the table's ("No orders yet",
 *    never "0 results");
 *  - distinguish EMPTY from FILTERED. "You have not sold anything yet" and
 *    "nothing matches this filter" want different words and different exits,
 *    and a component that renders one string for both gets it wrong half the
 *    time;
 *  - offer the exit. An empty state with no way out is a dead end, and the way
 *    out of a filtered view is to clear the filter, not to create a product.
 *
 * The icon is optional and `aria-hidden`: it is mood, and the words carry the
 * meaning.
 */
export function EmptyState({
  icon: Icon,
  title,
  body,
  action,
  secondaryAction,
  className,
  compact = false,
}: {
  icon?: LucideIcon;
  title: string;
  body?: string;
  action?: React.ReactNode;
  secondaryAction?: React.ReactNode;
  className?: string;
  /** For a state inside a card or a table, where the page has its own framing. */
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center text-center',
        compact ? 'px-4 py-8' : 'px-6 py-14',
        className,
      )}
    >
      {Icon ? (
        /*
         * A haloed well rather than a bare filled circle.
         *
         * Two spreads on one box-shadow: a 1px hairline that gives the disc an
         * edge, then an 8px spread of the SUNKEN ground itself, which paints a
         * soft concentric halo wherever the state sits on a lighter surface.
         *
         * It costs nothing and it is the difference between an empty state that
         * looks designed and a grey circle that reads as a disabled button. On a
         * sunken ground the halo simply disappears into its surroundings, which
         * is the correct behaviour rather than a bug — there is no lighter
         * surface for it to separate from.
         */
        <span
          className={cn(
            'bg-sunken text-faint mb-5 grid place-items-center rounded-full',
            'shadow-[0_0_0_1px_var(--elevation-ring),0_0_0_8px_var(--surface-sunken)]',
            compact ? 'size-11' : 'size-14',
          )}
          aria-hidden
        >
          <Icon className={compact ? 'size-5' : 'size-6'} strokeWidth={1.6} />
        </span>
      ) : null}

      <p
        className={cn(
          'text-ink font-semibold tracking-[-0.014em]',
          compact ? 'text-sm' : 'text-lg',
        )}
      >
        {title}
      </p>

      {body ? (
        <p
          className={cn(
            'text-muted mt-2 max-w-sm text-pretty leading-relaxed',
            compact ? 'text-xs' : 'text-sm',
          )}
        >
          {body}
        </p>
      ) : null}

      {action || secondaryAction ? (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondaryAction}
        </div>
      ) : null}
    </div>
  );
}
