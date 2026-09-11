'use client';

import {
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  CornerDownLeft,
  Menu,
  Search,
  X,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  createContext,
  Suspense,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from 'react';

import { Dialog, DialogContent } from '@/components/ui/dialog';
import { cn } from '@/lib/cn';

/**
 * Shell for the seller and admin consoles.
 *
 * Shared between both applications because they are the same kind of surface:
 * a persistent nav, a dense work area, and a header that says where you are.
 * Duplicating it would guarantee the two drift.
 *
 * WHAT WAS WRONG WITH THE LAST ONE, MEASURED
 *
 * The header was a fixed 62px row whose only content was an "accessory" slot.
 * The seller console put its live switch AND the signed-in name into it as a
 * vertical stack, and the stack's bottom sat 6px below the header's own, more
 * whenever a call card arrived because the cards stacked in there too. The
 * admin header was a bar with a name in the corner and nothing to say about
 * where you were.
 *
 * So the header now carries exactly one row by construction: breadcrumbs that
 * truncate, and a right-hand slot for compact controls only. Anything taller
 * (the live desk's call cards) portals itself out. Identity moved to the foot
 * of the rail, where a console user looks for it.
 *
 * THE RAIL
 *
 * Collapsible to an icon rail on a desktop, remembered per browser. The label is
 * never removed from the accessibility tree: collapsed items keep their name as
 * sr-only text and a tooltip, because a rail of unlabelled glyphs turns sixteen
 * destinations into sixteen guesses. Collapsing is a choice made for more table
 * width, not a default forced on anyone.
 *
 * A command palette (Cmd+K / Ctrl+K) jumps to any page. The admin console has
 * sixteen destinations; scanning a rail for one is slower than typing three
 * letters of it.
 */

export interface ConsoleNavItem {
  href: string;
  label: string;
  /**
   * A rendered ELEMENT, not a component reference. This shell is a Client
   * Component and both console layouts are Server Components, so a function
   * cannot cross the boundary: an element is serialisable, a component is not.
   */
  icon?: React.ReactNode;
  /** Queue count. A ReactNode so it can be a Suspense island that streams in. */
  badge?: React.ReactNode;
}

export interface ConsoleNavGroup {
  label: string;
  items: ConsoleNavItem[];
}

/* ------------------------------------------------------------ rail state */

/*
 * Collapsed-or-not, kept in localStorage and read through
 * useSyncExternalStore.
 *
 * The obvious version reads localStorage in an effect and calls setState: a
 * state update during commit, which React's lint rejects, and a second source of
 * truth for a value the browser already holds. An external store IS the
 * browser's value, with a server snapshot for the prerender.
 */
const RAIL_KEY = 'console-rail';
const railListeners = new Set<() => void>();

function subscribeRail(listener: () => void): () => void {
  railListeners.add(listener);
  window.addEventListener('storage', listener);
  return () => {
    railListeners.delete(listener);
    window.removeEventListener('storage', listener);
  };
}

function readRail(): boolean {
  try {
    return window.localStorage.getItem(RAIL_KEY) === 'collapsed';
  } catch {
    // Storage throws in some private modes and sandboxed frames. Expanded is
    // the safe default because it is the one that hides nothing.
    return false;
  }
}

function writeRail(collapsed: boolean): void {
  try {
    window.localStorage.setItem(RAIL_KEY, collapsed ? 'collapsed' : 'expanded');
  } catch {
    // Not persisted, but the listeners still fire so this session updates.
  }
  for (const listener of railListeners) listener();
}

const RailContext = createContext<{ collapsed: boolean }>({ collapsed: false });

/** Whether the desktop rail is collapsed. For things rendered inside the rail. */
export function useConsoleRail() {
  return useContext(RailContext);
}

/* ---------------------------------------------------------------- matching */

type FlatItem = ConsoleNavItem & { group: string };

function flatten(groups: ConsoleNavGroup[]): FlatItem[] {
  return groups.flatMap((group) => group.items.map((item) => ({ ...item, group: group.label })));
}

/**
 * The nav item a path belongs to: the LONGEST matching href.
 *
 * Longest rather than first, so /seller/products/new resolves to Products and
 * not to the Dashboard at /seller, which is a prefix of everything.
 */
function matchItem(items: FlatItem[], pathname: string, homeHref: string): FlatItem | null {
  let best: FlatItem | null = null;
  for (const item of items) {
    const hit =
      item.href === homeHref
        ? pathname === homeHref
        : pathname === item.href || pathname.startsWith(`${item.href}/`);
    if (hit && (!best || item.href.length > best.href.length)) best = item;
  }
  return best;
}

/** A readable crumb for the segment after a nav item, if there is one. */
function detailCrumb(pathname: string, item: FlatItem): string | null {
  if (pathname === item.href) return null;
  const rest = pathname.slice(item.href.length + 1).split('/')[0] ?? '';
  if (!rest) return null;
  if (rest === 'new') return 'New';
  // An id is not a name. A raw document id in a breadcrumb tells a person
  // nothing the page title does not already say better.
  if (/[_\d]/.test(rest) || rest.length > 18) return 'Details';
  return rest.charAt(0).toUpperCase() + rest.slice(1).replace(/-/g, ' ');
}

/* ---------------------------------------------------------------------- nav */

interface NavProps {
  groups: ConsoleNavGroup[];
  homeHref: string;
  onNavigate: () => void;
  collapsed: boolean;
}

function NavGroups({
  groups,
  homeHref,
  onNavigate,
  collapsed,
  pathname,
}: NavProps & { pathname: string | null }) {
  const flat = useMemo(() => flatten(groups), [groups]);
  const current = pathname ? matchItem(flat, pathname, homeHref) : null;

  return (
    <>
      {groups.map((group, index) => (
        <div key={group.label} className={cn(index > 0 && 'mt-5')}>
          <p
            className={cn(
              'text-faint mb-1.5 px-2.5 text-2xs font-semibold uppercase tracking-[0.12em]',
              collapsed && 'lg:hidden',
            )}
          >
            {group.label}
          </p>
          {/* A hairline stands in for the group label on the icon rail. */}
          {collapsed && index > 0 ? (
            <div aria-hidden className="bg-line mx-3 mb-2 hidden h-px lg:block" />
          ) : null}

          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = current?.href === item.href;

              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onNavigate}
                    aria-current={active ? 'page' : undefined}
                    title={collapsed ? item.label : undefined}
                    className={cn(
                      'group/item relative flex min-h-11 items-center gap-3 rounded-lg px-2.5 text-sm font-medium lg:min-h-9.5',
                      'transition-colors duration-(--duration-fast) ease-(--ease-out)',
                      'focus-visible:outline-accent focus-visible:outline-2 focus-visible:-outline-offset-2',
                      /*
                       * The active marker: a 3px bar on the leading edge. The tint
                       * alone is nearly gone on a dark rail, where accent-soft is a
                       * 16% wash over near-black; a solid bar carries the state in
                       * both themes, and it scales from the centre so a navigation
                       * reads as the marker moving rather than blinking.
                       */
                      'before:absolute before:inset-y-2 before:-left-3 before:w-[3px] before:rounded-full',
                      'before:origin-center before:transition-transform before:duration-(--duration-slow) before:ease-(--ease-spring)',
                      collapsed && 'lg:justify-center lg:px-0 lg:before:-left-2',
                      active
                        ? 'bg-accent-soft text-accent-ink before:bg-accent before:scale-y-100'
                        : 'text-muted hover:bg-sunken hover:text-ink before:scale-y-0',
                    )}
                  >
                    <span
                      className={cn(
                        'grid size-5 shrink-0 place-items-center [&_svg]:size-[1.125rem]',
                        active
                          ? '[&_svg]:text-accent-ink'
                          : '[&_svg]:text-faint group-hover/item:[&_svg]:text-ink',
                      )}
                    >
                      {item.icon}
                    </span>

                    <span className={cn('min-w-0 flex-1 truncate', collapsed && 'lg:sr-only')}>
                      {item.label}
                    </span>

                    {item.badge ? (
                      <span
                        className={cn(
                          'shrink-0',
                          // On the icon rail the count sits on the corner of the
                          // icon, small, rather than disappearing: a queue that
                          // needs attention must be visible at either width.
                          collapsed &&
                            'lg:absolute lg:right-1 lg:top-0.5 lg:origin-top-right lg:scale-75',
                        )}
                      >
                        {item.badge}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </>
  );
}

/**
 * The nav once the URL is known. usePathname must sit inside a Suspense
 * boundary under Cache Components, so it is isolated here: the boundary then
 * contains only the highlight, and the rest of the rail still prerenders.
 */
function ActiveNavGroups(props: NavProps) {
  const pathname = usePathname();
  return <NavGroups {...props} pathname={pathname} />;
}

/* -------------------------------------------------------------- breadcrumbs */

function Breadcrumbs({ groups, homeHref }: { groups: ConsoleNavGroup[]; homeHref: string }) {
  const pathname = usePathname();
  const flat = useMemo(() => flatten(groups), [groups]);
  const item = matchItem(flat, pathname, homeHref);

  if (!item) return null;

  const detail = detailCrumb(pathname, item);
  const crumbs: Array<{ label: string; href?: string }> = [
    { label: item.group },
    { label: item.label, href: detail ? item.href : undefined },
    ...(detail ? [{ label: detail }] : []),
  ];

  return (
    <ol className="flex min-w-0 items-center gap-1.5 text-sm">
      {crumbs.map((crumb, index) => {
        const last = index === crumbs.length - 1;
        return (
          <li
            key={`${crumb.label}-${index}`}
            className={cn(
              'flex min-w-0 items-center gap-1.5',
              // On a phone only the page itself is shown: three crumbs at 390px
              // either wrap or push the controls off the edge, and the rail the
              // group name comes from is one tap away.
              !last && 'hidden sm:flex',
            )}
          >
            {crumb.href ? (
              <Link
                href={crumb.href}
                className="text-muted hover:text-ink truncate transition-colors"
              >
                {crumb.label}
              </Link>
            ) : (
              <span
                className={cn('truncate', last ? 'text-ink font-medium' : 'text-faint')}
                aria-current={last ? 'page' : undefined}
              >
                {crumb.label}
              </span>
            )}
            {!last ? <ChevronRight className="text-faint size-3.5 shrink-0" aria-hidden /> : null}
          </li>
        );
      })}
    </ol>
  );
}

/* ---------------------------------------------------------- command palette */

function CommandPalette({
  open,
  onOpenChange,
  groups,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  groups: ConsoleNavGroup[];
}) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [highlight, setHighlight] = useState(0);

  const items = useMemo(() => flatten(groups), [groups]);
  const results = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter(
      (item) =>
        item.label.toLowerCase().includes(needle) || item.group.toLowerCase().includes(needle),
    );
  }, [items, query]);

  const active = Math.min(highlight, Math.max(0, results.length - 1));

  const go = (href: string) => {
    onOpenChange(false);
    router.push(href);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Go to" description="Jump to any page in the console.">
        <div className="-mt-1">
          <div className="border-line-control flex items-center gap-2.5 rounded-lg border px-3">
            <Search className="text-faint size-4 shrink-0" aria-hidden />
            <input
              autoFocus
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                // A new query means a new list; keeping the old index would
                // highlight whatever happens to land in that slot.
                setHighlight(0);
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  setHighlight((value) => Math.min(value + 1, results.length - 1));
                } else if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  setHighlight((value) => Math.max(value - 1, 0));
                } else if (event.key === 'Enter' && results[active]) {
                  event.preventDefault();
                  go(results[active].href);
                }
              }}
              placeholder={'Search pages\u2026'}
              aria-label="Search pages"
              aria-controls="console-palette-results"
              aria-activedescendant={
                results[active] ? `palette-${results[active].href}` : undefined
              }
              className="text-ink placeholder:text-faint h-11 w-full bg-transparent text-sm outline-none"
            />
          </div>

          <ul
            id="console-palette-results"
            role="listbox"
            aria-label="Pages"
            className="mt-3 max-h-80 space-y-0.5 overflow-y-auto"
          >
            {results.length === 0 ? (
              <li className="text-faint px-3 py-6 text-center text-sm">
                No page matches &ldquo;{query}&rdquo;.
              </li>
            ) : (
              results.map((item, index) => (
                <li
                  key={item.href}
                  id={`palette-${item.href}`}
                  role="option"
                  aria-selected={index === active}
                  onMouseEnter={() => setHighlight(index)}
                  onClick={() => go(item.href)}
                  className={cn(
                    'flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-sm',
                    '[&_svg]:size-4 [&_svg]:shrink-0',
                    index === active ? 'bg-accent-soft text-accent-ink' : 'text-ink',
                  )}
                >
                  <span className={index === active ? '' : '[&_svg]:text-faint'}>{item.icon}</span>
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  <span className="text-faint text-2xs">{item.group}</span>
                  {index === active ? <CornerDownLeft className="size-3.5" aria-hidden /> : null}
                </li>
              ))
            )}
          </ul>
        </div>
      </DialogContent>
    </Dialog>
  );
}
/* ------------------------------------------------------------------- shell */

export function ConsoleShell({
  groups,
  homeHref,
  brand,
  title,
  subtitle,
  user,
  headerEnd,
  children,
}: {
  groups: ConsoleNavGroup[];
  homeHref: string;
  /** A logo mark or store avatar, square, about 32px. */
  brand: React.ReactNode;
  /** ReactNode so a store name can stream in with the session. */
  title: React.ReactNode;
  subtitle: string;
  /** Pinned to the foot of the rail, normally ConsoleUserMenu. */
  user?: React.ReactNode;
  /**
   * Compact controls for the right of the header. ONE ROW ONLY: anything taller
   * must render itself elsewhere (the live desk portals its call cards),
   * because this bar has a fixed height and spills downward otherwise.
   */
  headerEnd?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  /*
   * Bumped on every open so the palette remounts with an empty query. Resetting
   * its state in an effect would be a setState during commit; a new key is a
   * clean slate with no effect at all.
   */
  const [paletteKey, setPaletteKey] = useState(0);

  const collapsed = useSyncExternalStore(subscribeRail, readRail, () => false);

  const close = () => setOpen(false);
  const openPalette = () => {
    setPaletteKey((value) => value + 1);
    setPaletteOpen(true);
  };

  // Cmd+K / Ctrl+K from anywhere in the console.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault();
        setPaletteKey((value) => value + 1);
        setPaletteOpen(true);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const navProps: NavProps = { groups, homeHref, onNavigate: close, collapsed };

  return (
    <RailContext.Provider value={{ collapsed }}>
      {/*
        console-type puts every heading back on the UI face; see global.css.

        The grid column is var(--rail-width) written out in full: an arbitrary
        Tailwind value that STARTS with -- is read as one bare custom-property
        name, so a compound value beginning that way silently drops the whole
        declaration.
      */}
      <div
        className={cn(
          'bg-canvas console-type min-h-dvh',
          'lg:grid lg:grid-cols-[var(--rail-width)_minmax(0,1fr)]',
          'lg:transition-[grid-template-columns] lg:duration-(--duration-slow) lg:ease-(--ease-out)',
        )}
        style={
          {
            '--rail-width': collapsed ? 'var(--spacing-shell-collapsed)' : 'var(--spacing-shell)',
          } as React.CSSProperties
        }
      >
        {/* ------------------------------------------------------------ rail */}

        <aside
          className={cn(
            'border-line bg-raised z-40 flex flex-col border-r',
            // Off-canvas below lg, docked above it.
            'fixed inset-y-0 left-0 w-(--spacing-shell) transition-transform duration-(--duration-drawer) ease-(--ease-out)',
            // Docked, the rail is sticky and one viewport tall, so the user menu
            // at its foot is always in reach however long the page is.
            'lg:sticky lg:top-0 lg:h-dvh lg:w-auto lg:translate-x-0 lg:self-start',
            open ? 'translate-x-0 shadow-xl' : '-translate-x-full',
          )}
        >
          <div
            className={cn(
              'border-line flex h-(--spacing-console-header) shrink-0 items-center gap-2.5 border-b px-3',
              collapsed && 'lg:justify-center lg:px-0',
            )}
          >
            <Link
              href={homeHref}
              onClick={close}
              className="focus-visible:outline-accent flex min-w-0 flex-1 items-center gap-2.5 rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 lg:flex-none"
            >
              <span className="grid size-8 shrink-0 place-items-center">{brand}</span>
              <span className={cn('min-w-0', collapsed && 'lg:sr-only')}>
                <span className="text-ink block truncate text-sm font-semibold leading-tight">
                  {title}
                </span>
                <span className="text-faint block truncate text-2xs">{subtitle}</span>
              </span>
            </Link>

            <button
              type="button"
              onClick={close}
              className="text-muted hover:text-ink hover:bg-sunken ml-auto grid size-11 shrink-0 place-items-center rounded-lg lg:hidden"
              aria-label="Close navigation"
            >
              <X className="size-5" />
            </button>
          </div>

          {/* Search: a real affordance on the rail, with its shortcut beside it. */}
          <div className={cn('px-3 pt-3', collapsed && 'lg:px-2')}>
            <button
              type="button"
              onClick={openPalette}
              title={collapsed ? 'Search (Ctrl+K)' : undefined}
              className={cn(
                'border-line bg-canvas text-faint hover:border-line-strong hover:text-muted flex h-10 w-full items-center gap-2.5 rounded-lg border px-3 text-sm',
                'transition-colors duration-(--duration-fast)',
                'focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-2',
                collapsed && 'lg:justify-center lg:px-0',
              )}
            >
              <Search className="size-4 shrink-0" aria-hidden />
              <span className={cn('flex-1 text-left', collapsed && 'lg:sr-only')}>
                {'Search\u2026'}
              </span>
              <kbd
                className={cn(
                  'border-line bg-raised rounded border px-1.5 py-0.5 font-sans text-2xs',
                  collapsed && 'lg:hidden',
                )}
              >
                {'\u2318K'}
              </kbd>
            </button>
          </div>

          <nav
            className={cn('flex-1 overflow-y-auto px-3 py-4', collapsed && 'lg:px-2')}
            aria-label="Console"
          >
            <Suspense fallback={<NavGroups {...navProps} pathname={null} />}>
              <ActiveNavGroups {...navProps} />
            </Suspense>
          </nav>

          <div className="border-line space-y-1 border-t p-2">
            <button
              type="button"
              onClick={() => writeRail(!collapsed)}
              className={cn(
                'text-faint hover:text-ink hover:bg-sunken hidden h-9 w-full items-center gap-3 rounded-lg px-2.5 text-xs font-medium lg:flex',
                'transition-colors duration-(--duration-fast)',
                collapsed && 'lg:justify-center lg:px-0',
              )}
              aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
              title={collapsed ? 'Expand navigation' : undefined}
            >
              {collapsed ? (
                <ChevronsRight className="size-4 shrink-0" aria-hidden />
              ) : (
                <>
                  <ChevronsLeft className="size-4 shrink-0" aria-hidden />
                  Collapse
                </>
              )}
            </button>

            {user}
          </div>
        </aside>

        {open ? (
          <button
            type="button"
            aria-label="Close navigation"
            onClick={close}
            className="animate-fade-in fixed inset-0 z-30 bg-(--surface-overlay) backdrop-blur-[3px] lg:hidden"
          />
        ) : null}

        {/* ------------------------------------------------------------ main */}

        <div className="flex min-w-0 flex-col">
          <header className="glass border-line sticky top-0 z-20 flex h-(--spacing-console-header) shrink-0 items-center gap-2 border-b px-3 sm:px-5 lg:px-8">
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="text-muted hover:text-ink hover:bg-sunken -ml-1 grid size-11 shrink-0 place-items-center rounded-lg lg:hidden"
              aria-label="Open navigation"
            >
              <Menu className="size-5" />
            </button>

            <nav aria-label="Breadcrumb" className="min-w-0 flex-1 overflow-hidden">
              <Suspense fallback={null}>
                <Breadcrumbs groups={groups} homeHref={homeHref} />
              </Suspense>
            </nav>

            {/* On a phone the rail is closed, so search needs its own way in. */}
            <button
              type="button"
              onClick={openPalette}
              className="text-muted hover:text-ink hover:bg-sunken grid size-11 shrink-0 place-items-center rounded-lg lg:hidden"
              aria-label="Search pages"
            >
              <Search className="size-5" />
            </button>

            {headerEnd ? <div className="flex shrink-0 items-center gap-2">{headerEnd}</div> : null}
          </header>

          <main className="min-w-0 flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
            {/*
              A ceiling on the work area. Past about 90rem the columns of a
              table drift so far apart that reading across a row becomes a head
              movement.
            */}
            <div className="mx-auto w-full max-w-[90rem]">{children}</div>
          </main>
        </div>

        <CommandPalette
          key={paletteKey}
          open={paletteOpen}
          onOpenChange={setPaletteOpen}
          groups={groups}
        />
      </div>
    </RailContext.Provider>
  );
}