import Link from 'next/link';

import { cn } from '@/lib/cn';

/**
 * Tabs.
 *
 * LINKS, not buttons, and that is the load-bearing decision. A filter belongs
 * in the URL so a view can be bookmarked, sent to a colleague, linked to from a
 * dashboard queue card, and restored by the back button. Client state here
 * would make every one of those impossible, and it is the reason the console's
 * queue cards can deep-link straight to "needs action".
 *
 * Two looks, one behaviour:
 *
 *   segmented  a pill rail. For filtering a list — the tabs are peers and the
 *              set is short. Scrolls horizontally on a phone rather than
 *              wrapping, because a wrapped filter rail eats a third of a small
 *              screen before the first row.
 *   underline  For switching between sections of a page, where the tabs are
 *              headings rather than filters and want more weight.
 *
 * `aria-current="page"` rather than `aria-selected`: these are links to
 * different URLs, not tabpanels being revealed, and claiming the tab role for
 * navigation makes a screen reader promise a panel that never arrives. This is
 * the same correction Phase 8 applied to filter links, where `aria-pressed` on
 * 37 nodes became `aria-current`.
 */

export interface TabItem {
  value: string;
  label: string;
  /** Rendered after the label — a queue count, usually. */
  badge?: React.ReactNode;
}

export function Tabs({
  items,
  current,
  href,
  variant = 'segmented',
  label = 'Filter',
  className,
}: {
  items: TabItem[];
  current: string;
  /** Builds the target for a tab. Keeps URL shape out of this component. */
  href: (value: string) => string;
  variant?: 'segmented' | 'underline';
  label?: string;
  className?: string;
}) {
  const underline = variant === 'underline';

  return (
    <nav
      aria-label={label}
      className={cn(
        'no-scrollbar -mx-1 flex overflow-x-auto px-1',
        underline ? 'border-line gap-1 border-b' : 'gap-1 pb-1',
        className,
      )}
    >
      {items.map((item) => {
        const active = item.value === current;

        return (
          <Link
            key={item.value}
            href={href(item.value)}
            aria-current={active ? 'page' : undefined}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap text-xs',
              'transition-[color,background-color,border-color]',
              'duration-(--duration-base) ease-(--ease-out)',
              // 44x44 while a thumb drives it; dense once a pointer does. A tab
              // labelled "All" is 38px wide, which passes on height and fails a
              // finger, so the minimum has to cover both axes.
              'min-h-11 min-w-11 justify-center lg:min-h-0 lg:min-w-0',
              'motion-safe:active:scale-[0.97]',
              underline
                ? [
                    /*
                     * The rule is drawn by a pseudo-element rather than by
                     * `border-b`, so the active tab can carry a 2px indicator
                     * that is INSET from the label's box — a full-width border
                     * under a padded tab reads as a box, not as an underline.
                     *
                     * It also grows from the centre on hover, which is a cue
                     * the border version cannot give: a border either exists or
                     * it does not.
                     */
                    'relative -mb-px px-3.5 py-3 after:absolute after:inset-x-2 after:bottom-0',
                    'after:h-0.5 after:rounded-full after:origin-center',
                    'after:transition-transform after:duration-(--duration-slow) after:ease-(--ease-spring)',
                    active
                      ? 'text-ink font-semibold after:bg-accent after:scale-x-100'
                      : 'text-muted hover:text-ink after:bg-line-bold after:scale-x-0 hover:after:scale-x-100',
                  ]
                : [
                    /*
                     * A pill, and the active one is near-black rather than
                     * brand-coloured. A row of filters is not the place for the
                     * accent: whichever one is selected would then outrank the
                     * primary action on the page it is filtering.
                     */
                    'rounded-full border px-4 py-2',
                    active
                      ? 'bg-ink border-ink text-canvas font-semibold'
                      : 'text-muted border-line-control hover:border-line-bold hover:text-ink hover:bg-sunken',
                  ],
            )}
          >
            {item.label}
            {item.badge ? <span className="shrink-0">{item.badge}</span> : null}
          </Link>
        );
      })}
    </nav>
  );
}
