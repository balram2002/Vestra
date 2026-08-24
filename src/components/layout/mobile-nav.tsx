'use client';

import { ChevronRight, Menu, X } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import type { Category } from '@/domain/types';
import { cn } from '@/lib/cn';

/**
 * Mobile navigation.
 *
 * A client island — the only interactive part of the header — so the rest of
 * the navigation stays static and free of hydration cost.
 *
 * The mobile menu is a drawer with drill-down rather than a flattened
 * accordion: on a phone, a three-level taxonomy shown all at once is a
 * scrolling wall, and every tap target ends up competing. Drilling in keeps one
 * level on screen at a time and matches the back gesture people already expect.
 */
export function MobileNav({
  menu,
}: {
  menu: Array<{ department: Category; groups: Array<{ shelf: Category; leaves: Category[] }> }>;
}) {
  const [open, setOpen] = useState(false);
  const [departmentSlug, setDepartmentSlug] = useState<string | null>(null);

  /**
   * Navigating must close the drawer, or the destination renders behind it.
   *
   * Handled by delegating from the drawer rather than by watching `pathname` in
   * an effect: reacting to the route change would mean a setState during an
   * effect, which cascades an extra render on every navigation. Closing on the
   * click that causes the navigation is both cheaper and more direct.
   */
  const closeOnNavigate = (event: React.MouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest('a')) {
      setOpen(false);
      setDepartmentSlug(null);
    }
  };

  // A drawer that scrolls the page behind it feels broken on touch.
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  // Escape is the expected way out of any overlay.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  const active = menu.find((entry) => entry.department.slug === departmentSlug) ?? null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-muted hover:bg-sunken hover:text-ink -ml-2 flex size-10 items-center justify-center rounded-md transition-colors lg:hidden"
        aria-label="Open menu"
        aria-expanded={open}
      >
        <Menu className="size-5" />
      </button>

      {open ? (
        <div className="fixed inset-0 z-[60] lg:hidden">
          <button
            type="button"
            aria-label="Close menu"
            onClick={() => setOpen(false)}
            className="animate-fade-in absolute inset-0 bg-[--surface-overlay]"
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-label="Site navigation"
            className={cn(
              'bg-raised absolute inset-y-0 left-0 flex w-[88%] max-w-sm flex-col',
              'motion-safe:animate-[slide-in_0.24s_var(--ease-out-quint)]',
            )}
          >
            <div className="border-line flex h-[--spacing-header] items-center justify-between border-b px-4">
              {active ? (
                <button
                  type="button"
                  onClick={() => setDepartmentSlug(null)}
                  className="text-ink flex items-center gap-1.5 text-sm font-medium"
                >
                  <ChevronRight className="size-4 rotate-180" />
                  All departments
                </button>
              ) : (
                <span className="font-display text-ink text-xl">Vestra</span>
              )}

              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-muted hover:text-ink -mr-2 flex size-10 items-center justify-center rounded-md"
                aria-label="Close menu"
              >
                <X className="size-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain" onClick={closeOnNavigate}>
              {active ? (
                <div className="p-4">
                  <Link
                    href={`/category/${active.department.slug}`}
                    className="text-accent-ink block py-2 text-sm font-semibold"
                  >
                    Shop all {active.department.name}
                  </Link>

                  {active.groups.map(({ shelf, leaves }) => (
                    <div key={shelf.id} className="border-line border-t py-3">
                      <Link
                        href={`/category/${shelf.slug}`}
                        className="text-ink block text-xs font-semibold uppercase tracking-wider"
                      >
                        {shelf.name}
                      </Link>
                      <ul className="mt-2 space-y-1">
                        {leaves.map((leaf) => (
                          <li key={leaf.id}>
                            <Link
                              href={`/category/${leaf.slug}`}
                              className="text-muted block py-1.5 text-sm"
                            >
                              {leaf.name}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              ) : (
                <ul className="p-2">
                  {menu.map(({ department, groups }) => (
                    <li key={department.id}>
                      {groups.length > 0 ? (
                        <button
                          type="button"
                          onClick={() => setDepartmentSlug(department.slug)}
                          className="text-ink hover:bg-sunken flex w-full items-center justify-between rounded-md px-3 py-3 text-left text-sm font-medium"
                        >
                          {department.name}
                          <ChevronRight className="text-faint size-4" />
                        </button>
                      ) : (
                        <Link
                          href={`/category/${department.slug}`}
                          className="text-ink hover:bg-sunken flex items-center justify-between rounded-md px-3 py-3 text-sm font-medium"
                        >
                          {department.name}
                        </Link>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="border-line grid grid-cols-2 gap-2 border-t p-4" onClick={closeOnNavigate}>
              <Link
                href="/account"
                className="border-line text-ink rounded-md border px-3 py-2.5 text-center text-sm font-medium"
              >
                Your account
              </Link>
              <Link
                href="/orders"
                className="border-line text-ink rounded-md border px-3 py-2.5 text-center text-sm font-medium"
              >
                Your orders
              </Link>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
