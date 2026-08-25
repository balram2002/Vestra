'use client';

import { SlidersHorizontal, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';

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
 * The rail itself is passed in as `children` — it is a Server Component that
 * reads facet counts, and re-implementing it for mobile would guarantee the two
 * drift apart. This component owns nothing but the open/closed state.
 */
export function FilterDrawer({
  appliedCount,
  children,
}: {
  appliedCount: number;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setOpen(false), []);

  /*
   * Modal behaviour, done by hand because this dialog is the only one in the
   * app that wraps a Server Component subtree.
   *
   * Three things a keyboard or screen-reader user needs and that CSS alone does
   * not provide: focus must MOVE into the drawer on open, must not ESCAPE it
   * while it is over the page, and must RETURN to the trigger on close.
   * Without the last one, dismissing the drawer drops focus onto <body> and the
   * next Tab starts again from the top of the document.
   */
  useEffect(() => {
    if (!open) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        close();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = panelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable || focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKey);
      previouslyFocused?.focus?.();
    };
  }, [open, close]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="border-line-strong text-ink hover:border-ink inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors"
      >
        <SlidersHorizontal className="size-4" aria-hidden />
        Filters
        {appliedCount > 0 ? (
          <span className="bg-ink text-canvas tabular rounded-full px-1.5 py-0.5 text-2xs font-semibold">
            {appliedCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex" role="dialog" aria-modal="true" aria-label="Filters">
          <button
            type="button"
            aria-label="Close filters"
            onClick={close}
            className="absolute inset-0 bg-black/45"
          />

          <div
            ref={panelRef}
            className={cn(
              'bg-canvas relative ml-auto flex h-full w-[85%] max-w-sm flex-col shadow-xl',
              'motion-safe:animate-[slide-in-right_220ms_cubic-bezier(0.22,1,0.36,1)]',
            )}
          >
            <header className="border-line flex items-center justify-between border-b px-4 py-3">
              <h2 className="font-display text-ink text-lg">Filters</h2>
              <button
                ref={closeRef}
                type="button"
                onClick={close}
                aria-label="Close filters"
                className="text-muted hover:text-ink"
              >
                <X className="size-5" />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-4 py-4">{children}</div>

            {/*
              A single dismiss action. The filters themselves are links that
              navigate, so there is nothing to "apply" — the results behind the
              drawer have already updated.
            */}
            <footer className="border-line border-t p-4">
              <button
                type="button"
                onClick={close}
                className="bg-ink text-canvas h-11 w-full rounded-md text-sm font-medium"
              >
                Show results
              </button>
            </footer>
          </div>
        </div>
      ) : null}
    </div>
  );
}
