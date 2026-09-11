'use client';

import * as RadixDialog from '@radix-ui/react-dialog';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Heart, Menu, Package, User, X } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';

import { ThemeToggle } from '@/components/theme/theme-toggle';
import { CLOSE_BUTTON, OVERLAY } from '@/components/ui/dialog';
import type { Category } from '@/domain/types';
import { cn } from '@/lib/cn';
import { spring, tween } from '@/lib/motion';

import { BrandLockup } from './wordmark';

/**
 * Mobile navigation.
 *
 * A client island — the only genuinely interactive part of the header — so the
 * rest of the navigation stays static and free of hydration cost.
 *
 * ON RADIX, NOT HAND-ROLLED. The previous version built its own overlay, which
 * meant it had no focus trap: tabbing from the last link went to the page
 * behind the drawer, which is still there and still tabbable. Radix brings the
 * trap, the inert background, Escape, scroll locking and focus restoration —
 * five things that are individually small and collectively the difference
 * between a drawer and a div.
 *
 * DRILL-DOWN, NOT ACCORDION. On a phone a three-level taxonomy shown all at
 * once is a scrolling wall where every tap target competes with every other.
 * Drilling in keeps one level on screen, matches the back gesture people
 * already expect, and — the part that actually makes it feel native — the two
 * panels SLIDE PAST EACH OTHER rather than swapping. The direction of that
 * slide is what tells someone whether they went deeper or came back.
 */
export function MobileNav({
  menu,
}: {
  menu: Array<{ department: Category; groups: Array<{ shelf: Category; leaves: Category[] }> }>;
}) {
  const [open, setOpen] = useState(false);
  const [departmentSlug, setDepartmentSlug] = useState<string | null>(null);
  const reduced = useReducedMotion() ?? false;

  const active = menu.find((entry) => entry.department.slug === departmentSlug) ?? null;

  /**
   * Navigating must close the drawer, or the destination renders behind it.
   *
   * Delegated from the panel rather than watched via `pathname` in an effect:
   * reacting to the route change would mean a setState during an effect, which
   * cascades an extra render on every navigation. Closing on the click that
   * causes the navigation is both cheaper and more direct.
   */
  const closeOnNavigate = (event: React.MouseEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest('a')) setOpen(false);
  };

  // Reset the drill-down AFTER the exit animation, not during it: resetting on
  // close makes the panel visibly flip back to the root while it slides away.
  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) setDepartmentSlug(null);
  };

  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <RadixDialog.Trigger asChild>
        <button
          type="button"
          className={cn(
            'text-muted hover:bg-sunken hover:text-ink -ml-1.5 flex size-11 shrink-0',
            'items-center justify-center rounded-full transition-colors lg:hidden',
            'motion-safe:active:scale-90',
          )}
          aria-label="Open menu"
        >
          <Menu className="size-[1.35rem]" strokeWidth={1.9} aria-hidden />
        </button>
      </RadixDialog.Trigger>

      <RadixDialog.Portal>
        <RadixDialog.Overlay className={cn(OVERLAY, 'lg:hidden')} />

        <RadixDialog.Content
          aria-describedby={undefined}
          className={cn(
            'bg-raised border-line fixed inset-y-0 left-0 z-50 flex w-[min(21rem,88vw)] flex-col',
            'overflow-hidden border-r shadow-xl lg:hidden',
            'motion-safe:data-[state=open]:animate-[mrd-slide-from-left_var(--duration-drawer)_var(--ease-out)]',
            'motion-safe:data-[state=closed]:animate-[mrd-slide-to-left_var(--duration-base)_var(--ease-in)]',
          )}
        >
          <RadixDialog.Title className="sr-only">Site navigation</RadixDialog.Title>

          <div className="border-line flex h-(--spacing-header) shrink-0 items-center justify-between gap-2 border-b pl-4 pr-2">
            <AnimatePresence mode="wait" initial={false}>
              {active ? (
                <motion.button
                  key="back"
                  type="button"
                  onClick={() => setDepartmentSlug(null)}
                  initial={reduced ? false : { opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={reduced ? undefined : { opacity: 0, x: -8 }}
                  transition={tween.fast}
                  className="text-ink -ml-2 flex min-h-11 items-center gap-1 rounded-full pl-2 pr-3 text-sm font-medium"
                >
                  <ChevronLeft className="size-4" aria-hidden />
                  {active.department.name}
                </motion.button>
              ) : (
                <motion.span
                  key="brand"
                  initial={reduced ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={reduced ? undefined : { opacity: 0 }}
                  transition={tween.fast}
                >
                  <BrandLockup size="sm" />
                </motion.span>
              )}
            </AnimatePresence>

            <RadixDialog.Close aria-label="Close menu" className={cn(CLOSE_BUTTON)}>
              <X className="size-5" aria-hidden />
            </RadixDialog.Close>
          </div>

          {/*
            The two panels.

            `mode="wait"` would leave the drawer empty for the length of the
            exit; here both are mounted at once and cross-slide, which is what
            makes the drill read as one surface moving rather than two states
            swapping. The container clips, so the outgoing panel disappears at
            the edge instead of overflowing the drawer.
          */}
          <div className="relative min-h-0 flex-1" onClick={closeOnNavigate}>
            <AnimatePresence initial={false}>
              {active ? (
                <motion.div
                  key={active.department.slug}
                  initial={reduced ? false : { x: '100%' }}
                  animate={{ x: 0 }}
                  exit={reduced ? undefined : { x: '100%' }}
                  transition={spring.base}
                  className="absolute inset-0 overflow-y-auto overscroll-contain p-4"
                >
                  <Link
                    href={`/category/${active.department.slug}`}
                    className="bg-accent-soft text-accent-ink flex min-h-11 items-center justify-between rounded-md px-3.5 text-sm font-semibold"
                  >
                    Shop all {active.department.name}
                    <ChevronRight className="size-4" aria-hidden />
                  </Link>

                  {active.groups.map(({ shelf, leaves }) => (
                    <div key={shelf.id} className="border-line mt-3 border-t pt-2">
                      <Link
                        href={`/category/${shelf.slug}`}
                        className="text-ink flex min-h-11 items-center text-2xs font-semibold uppercase tracking-[0.14em]"
                      >
                        {shelf.name}
                      </Link>
                      <ul>
                        {leaves.map((leaf) => (
                          <li key={leaf.id}>
                            <Link
                              href={`/category/${leaf.slug}`}
                              className="text-muted active:bg-sunken flex min-h-11 items-center rounded-md text-sm"
                            >
                              {leaf.name}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </motion.div>
              ) : (
                <motion.div
                  key="root"
                  initial={reduced ? false : { x: '-30%', opacity: 0.4 }}
                  animate={{ x: 0, opacity: 1 }}
                  exit={reduced ? undefined : { x: '-30%', opacity: 0.4 }}
                  transition={spring.base}
                  className="absolute inset-0 overflow-y-auto overscroll-contain p-2"
                >
                  <ul>
                    {menu.map(({ department, groups }) => (
                      <li key={department.id}>
                        {groups.length > 0 ? (
                          <button
                            type="button"
                            onClick={() => setDepartmentSlug(department.slug)}
                            className="text-ink active:bg-sunken flex min-h-12 w-full items-center justify-between rounded-md px-3 text-left text-md font-medium"
                          >
                            {department.name}
                            <ChevronRight className="text-faint size-4" aria-hidden />
                          </button>
                        ) : (
                          <Link
                            href={`/category/${department.slug}`}
                            className="text-ink active:bg-sunken flex min-h-12 items-center rounded-md px-3 text-md font-medium"
                          >
                            {department.name}
                          </Link>
                        )}
                      </li>
                    ))}
                  </ul>

                  <div className="border-line mt-2 space-y-0.5 border-t pt-2">
                    <QuickLink href="/account" icon={User}>
                      Your account
                    </QuickLink>
                    <QuickLink href="/orders" icon={Package}>
                      Your orders
                    </QuickLink>
                    <QuickLink href="/wishlist" icon={Heart}>
                      Saved items
                    </QuickLink>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <div className="border-line flex shrink-0 items-center justify-between gap-3 border-t p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <span className="text-faint text-2xs">Appearance</span>
            <ThemeToggle />
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}

function QuickLink({
  href,
  icon: Icon,
  children,
}: {
  href: string;
  icon: typeof User;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="text-muted active:bg-sunken flex min-h-11 items-center gap-3 rounded-md px-3 text-sm"
    >
      <Icon className="size-4 shrink-0" aria-hidden strokeWidth={1.8} />
      {children}
    </Link>
  );
}
