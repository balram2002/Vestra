'use client';

import { SlidersHorizontal } from 'lucide-react';
import { useState } from 'react';

import { Drawer, DrawerClose, DrawerContent, DrawerTrigger } from '@/components/ui/drawer';
import { cn } from '@/lib/cn';

/**
 * Filters on small screens.
 *
 * The filter rail is `hidden lg:block`, which left a phone shopper able to sort
 * but not to filter at all — on a category with 94 items and eleven facets.
 * This is the missing half.
 *
 * A drawer rather than an inline accordion, because the alternative is pushing
 * the product grid a full screen down the page on the surface where vertical
 * space is scarcest.
 *
 * THE RAIL IS PASSED IN AS `children`. It is a Server Component that reads
 * facet counts, and re-implementing it for mobile would guarantee the two drift
 * apart the first time a facet is added. This component owns nothing but the
 * open state.
 *
 * It used to hand-roll the whole dialog — focus trap, scroll lock, Escape,
 * focus restoration, about sixty lines of it. All four now come from
 * `ui/drawer`, which is Radix underneath, so this file is the trigger and
 * nothing else. Every overlay in the app gets the same behaviour, and the
 * filter drawer stops being the one that has its own subtly different version.
 */
export function FilterDrawer({
  appliedCount,
  children,
}: {
  appliedCount: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <button
          type="button"
          className={cn(
            'border-line-control text-ink hover:border-line-bold inline-flex min-h-11 items-center',
            'gap-2 rounded-full border px-4 text-sm font-medium transition-colors',
            'motion-safe:active:scale-[0.97]',
          )}
        >
          <SlidersHorizontal className="size-4" aria-hidden />
          Filters
          {appliedCount > 0 ? (
            <span className="bg-ink text-canvas tabular rounded-full px-1.5 py-0.5 text-2xs font-semibold">
              {appliedCount}
            </span>
          ) : null}
        </button>
      </DrawerTrigger>

      <DrawerContent
        title="Filters"
        description={appliedCount > 0 ? `${appliedCount} applied` : undefined}
        side="right"
        footer={
          /*
            A single dismiss action. The filters themselves are links that
            navigate, so there is nothing to "apply" — the results behind the
            drawer have already updated by the time this is pressed. The button
            says "Show results" rather than "Apply" precisely so it does not
            promise a change it is not making.
          */
          <DrawerClose className="bg-ink text-canvas h-11 w-full rounded-full text-sm font-semibold transition-transform motion-safe:active:scale-[0.98]">
            Show results
          </DrawerClose>
        }
      >
        {/*
          Navigating closes the drawer.

          Delegated from the panel because every filter in the rail is a real
          `<Link>`, and leaving the drawer open over the freshly filtered grid
          is the single most confusing thing this surface can do. Handled here
          rather than in the rail so the rail stays a plain Server Component
          with no knowledge of what is wrapping it.
        */}
        <div
          onClick={(event) => {
            if ((event.target as HTMLElement).closest('a')) setOpen(false);
          }}
        >
          {children}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
