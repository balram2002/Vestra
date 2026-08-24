'use client';

import { Menu, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

import { cn } from '@/lib/cn';

/**
 * Shell for the seller and admin consoles.
 *
 * Shared between both applications because they are the same kind of surface:
 * a persistent nav, a dense work area, and a header that says who you are and
 * what you are looking at. Duplicating it would guarantee the two drift.
 *
 * Consoles are deliberately DENSER than the storefront — smaller type, tighter
 * rows, more on screen. A shop is browsed; a console is worked in, and someone
 * clearing a fulfilment queue wants forty rows visible, not twelve.
 */

export interface ConsoleNavItem {
  href: string;
  label: string;
  /**
   * Queue count, rendered on the right.
   *
   * A ReactNode rather than a number so it can be a `<Suspense>` island: the
   * nav itself is static and prerenders, while the counts — which are per-user
   * and therefore dynamic — stream in without holding up the shell.
   */
  badge?: React.ReactNode;
}

export interface ConsoleNavGroup {
  label: string;
  items: ConsoleNavItem[];
}

export function ConsoleShell({
  groups,
  title,
  subtitle,
  homeHref,
  accessory,
  children,
}: {
  groups: ConsoleNavGroup[];
  /** ReactNode so the store name can stream in with the session. */
  title: React.ReactNode;
  subtitle: string;
  homeHref: string;
  accessory?: React.ReactNode;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-canvas min-h-dvh lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      {/* ---------------------------------------------------------- nav */}

      <aside
        className={cn(
          'border-line bg-raised z-40 flex flex-col border-r',
          // Off-canvas below lg, permanently docked above it.
          'fixed inset-y-0 left-0 w-60 transition-transform lg:static lg:translate-x-0',
          open ? 'translate-x-0' : '-translate-x-full',
        )}
      >
        <div className="border-line flex h-14 items-center justify-between border-b px-4">
          <Link href={homeHref} className="min-w-0">
            <span className="font-display text-ink block truncate text-md leading-none">
              {title}
            </span>
            <span className="text-faint mt-0.5 block truncate text-2xs uppercase tracking-[0.14em]">
              {subtitle}
            </span>
          </Link>

          <button
            type="button"
            onClick={() => setOpen(false)}
            className="text-muted hover:text-ink lg:hidden"
            aria-label="Close navigation"
          >
            <X className="size-5" />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto px-2.5 py-4" aria-label="Console">
          {groups.map((group) => (
            <div key={group.label} className="mb-5">
              <p className="text-faint px-2.5 pb-1.5 text-2xs font-medium uppercase tracking-[0.14em]">
                {group.label}
              </p>

              <ul className="space-y-0.5">
                {group.items.map((item) => {
                  // Exact match for the index route, prefix match for the rest,
                  // so /seller does not stay highlighted on /seller/orders.
                  const active =
                    item.href === homeHref
                      ? pathname === item.href
                      : pathname === item.href || pathname.startsWith(`${item.href}/`);

                  return (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        onClick={() => setOpen(false)}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'flex items-center justify-between gap-2 rounded-md px-2.5 py-2 text-sm transition-colors',
                          active
                            ? 'bg-ink text-canvas font-medium'
                            : 'text-muted hover:bg-sunken hover:text-ink',
                        )}
                      >
                        <span className="truncate">{item.label}</span>
                        {item.badge ? <span className="shrink-0">{item.badge}</span> : null}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className="border-line border-t p-3">
          <Link
            href="/"
            className="text-faint hover:text-ink block rounded-md px-2.5 py-2 text-xs transition-colors"
          >
            ← Back to the shop
          </Link>
        </div>
      </aside>

      {open ? (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-30 bg-black/40 lg:hidden"
        />
      ) : null}

      {/* --------------------------------------------------------- main */}

      <div className="flex min-w-0 flex-col">
        <header className="border-line bg-raised sticky top-0 z-20 flex h-14 items-center gap-3 border-b px-4">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="text-muted hover:text-ink lg:hidden"
            aria-label="Open navigation"
          >
            <Menu className="size-5" />
          </button>

          <div className="ml-auto flex items-center gap-3">{accessory}</div>
        </header>

        <main className="min-w-0 flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
