'use client';

import * as RadixDialog from '@radix-ui/react-dialog';
import { ArrowUpRight, Clock, CornerDownLeft, Search, X } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/format';
import { suggest } from '@/server/actions/search';
import type { SearchHit, SearchResults } from '@/server/services/search';

/**
 * Search.
 *
 * One overlay for every width, opened from the header's search control or by
 * pressing `/` anywhere on the storefront. A separate mobile search PAGE was
 * the alternative and it is worse in the way that matters: it is a navigation,
 * so it loses the page the shopper was on, and coming back means a history
 * entry that does nothing.
 *
 * LIVE RESULTS, FROM THE SERVER. This panel used to offer only recent searches
 * and a few departments, on the honest grounds that client-side substring
 * matching over a partial catalogue is worse than nothing. It now asks the
 * server, which searches products, brands, categories and stores together.
 *
 * THE GROUPS ARE THE POINT. A brand is not a product and a store is not a
 * category: each goes somewhere different, so each is shown under its own
 * heading with its own kind of subtitle -- a price for a product, a product
 * count for a brand, its parent for a category. One undifferentiated list is
 * what produces a tap that lands somewhere the shopper did not mean.
 *
 * Typing stays responsive because the request is debounced, every reply is
 * matched against the query that asked for it, and the panel keeps showing the
 * last good results while the next ones are in flight -- a panel that empties
 * on every keystroke reads as broken.
 *
 * Recent searches live in `localStorage` and nowhere else. They are a
 * convenience for one person on one device, they are not worth a round trip,
 * and — this being a record of what someone looked for — they are not worth
 * putting on a server either.
 */

const RECENT_KEY = 'vestra-recent-searches';
const RECENT_LIMIT = 6;

function readRecent(): string[] {
  try {
    const raw = localStorage.getItem(RECENT_KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    // Private window, or a value someone else's code wrote. Either way an
    // empty history is a working search box.
    return [];
  }
}

function pushRecent(term: string): void {
  try {
    const next = [term, ...readRecent().filter((t) => t !== term)].slice(0, RECENT_LIMIT);
    localStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch {
    // Not being able to remember a search is not a reason to fail one.
  }
}

export interface SearchQuickLink {
  label: string;
  href: string;
}

/**
 * The header's search: two triggers, one overlay.
 *
 * Both the phone icon and the desktop field open the SAME dialog, and that is
 * why they live in one component rather than two `SearchOverlay` instances.
 * Two instances would mean two `/` key listeners — so one keypress opens two
 * dialogs, and the second traps focus inside the first — plus two copies of the
 * recent-search state that only one of them ever writes to.
 *
 * The desktop trigger is a BUTTON dressed as a field rather than a real input.
 * A real input in the header would need its own submit, its own suggestion
 * behaviour and its own mobile fallback: three implementations of one feature.
 * This one looks like a field, announces as a button, and opens the thing that
 * actually searches.
 */
export function HeaderSearch({ quickLinks }: { quickLinks: SearchQuickLink[] }) {
  return (
    <SearchOverlay
      quickLinks={quickLinks}
      trigger={
        <>
          <button
            type="button"
            className={cn(
              'text-muted hover:bg-sunken hover:text-ink relative flex size-11 shrink-0',
              'items-center justify-center rounded-full lg:hidden',
              'transition-[background-color,color,transform] duration-(--duration-base) ease-(--ease-out)',
              'motion-safe:active:scale-90',
            )}
            aria-label="Search"
          >
            <Search className="size-[1.15rem]" aria-hidden />
          </button>

          <button
            type="button"
            className={cn(
              'bg-sunken border-line-control text-faint hidden h-10 items-center gap-2.5',
              'rounded-full border pl-3.5 pr-2.5 text-sm lg:flex lg:w-44 xl:w-64',
              'hover:border-line-bold hover:text-muted transition-colors',
              'focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-2',
            )}
          >
            <Search className="size-4 shrink-0" aria-hidden />
            <span className="hidden lg:inline">Search products</span>
            {/*
              The shortcut hint is `aria-hidden`: "/" announced mid-sentence is
              noise, and it is a visual affordance for people who already know
              the convention rather than a way to teach it.
            */}
            <kbd
              aria-hidden
              className="border-line bg-raised text-faint ml-auto hidden rounded border px-1.5 py-0.5 font-sans text-[0.65rem] xl:block"
            >
              /
            </kbd>
          </button>
        </>
      }
    />
  );
}

export function SearchOverlay({
  quickLinks,
  trigger,
}: {
  /** Departments, from the taxonomy. Somewhere to go with an empty query. */
  quickLinks: SearchQuickLink[];
  /**
   * What opens the panel.
   *
   * May be a fragment of several buttons: it is rendered inside a plain
   * wrapper whose click is delegated, rather than through `Dialog.Trigger`,
   * which accepts exactly one child. Delegation is what lets the phone icon and
   * the desktop field share one dialog.
   */
  trigger: React.ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const [results, setResults] = useState<{ query: string; data: SearchResults } | null>(null);
  const [active, setActive] = useState(-1);
  const input = useRef<HTMLInputElement>(null);

  const term = query.trim();

  /*
   * Ask the server, 180ms after the typing stops.
   *
   * The reply carries the query it answered, so a slow response for "sh" can
   * never overwrite the results for "shirt" -- the classic race in every
   * type-ahead. The previous results stay on screen until the new ones arrive.
   */
  useEffect(() => {
    if (term.length < 2) return;

    const timer = window.setTimeout(async () => {
      const data = await suggest({ query: term });
      setResults({ query: term, data });
    }, 180);

    return () => window.clearTimeout(timer);
  }, [term]);

  const showing = term.length >= 2 && results?.query === term ? results.data : null;
  const searching = term.length >= 2 && results?.query !== term;

  /*
   * One flat list behind the groups, for the arrow keys.
   *
   * The visible order is products, brands, categories, stores, and this
   * mirrors it exactly -- a keyboard user moving down the panel must land on
   * the same row an eye would.
   */
  const flat: SearchHit[] = showing
    ? [...showing.products, ...showing.brands, ...showing.categories, ...showing.sellers]
    : [];

  /**
   * Open, and read the history at the same moment.
   *
   * Reading in the OPEN HANDLER rather than in an effect keyed on `open` is the
   * difference between one render and two: an effect would commit the open
   * state, then immediately set another and re-render the whole panel. It also
   * keeps `localStorage` untouched on every page of the shop where nobody ever
   * presses search.
   */
  const changeOpen = useCallback((next: boolean) => {
    setOpen(next);
    if (next) setRecent(readRecent());
  }, []);

  /**
   * `/` opens search from anywhere, the way every search-led product does.
   *
   * Guarded on the event target, and that guard is the whole feature: without
   * it, typing a slash into the coupon field or a seller's product description
   * opens a search panel and eats the character.
   */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;

      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (target?.isContentEditable) return;

      event.preventDefault();
      changeOpen(true);
    };

    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [changeOpen]);

  /** Follow a result. The term is remembered: it is what led there. */
  const go = useCallback(
    (href: string) => {
      if (term) pushRecent(term);
      setOpen(false);
      setQuery('');
      setActive(-1);
      router.push(href);
    },
    [router, term],
  );

  const submit = useCallback(
    (term: string) => {
      const trimmed = term.trim();
      if (!trimmed) return;
      pushRecent(trimmed);
      setOpen(false);
      setQuery('');
      router.push(`/search?q=${encodeURIComponent(trimmed)}`);
    },
    [router],
  );

  return (
    <RadixDialog.Root open={open} onOpenChange={changeOpen}>
      {/*
        Delegated rather than `Dialog.Trigger`.

        Radix's trigger takes exactly one child and clones props onto it, which
        rules out a fragment of two buttons — and two buttons sharing one dialog
        is precisely the requirement. A click anywhere in this wrapper that
        landed on a button opens the panel; the `closest` check means a stray
        click on the gap between them does nothing.
      */}
      <span
        className="contents"
        onClick={(event) => {
          if ((event.target as HTMLElement).closest('button')) changeOpen(true);
        }}
      >
        {trigger}
      </span>

      <RadixDialog.Portal>
        <RadixDialog.Overlay
          className={cn(
            'fixed inset-0 z-[60] bg-(--surface-overlay) backdrop-blur-[3px]',
            'motion-safe:data-[state=open]:animate-[mrd-fade-in_var(--duration-base)_var(--ease-out)]',
            'motion-safe:data-[state=closed]:animate-[mrd-fade-out_var(--duration-fast)_var(--ease-in)]',
          )}
        />

        <RadixDialog.Content
          aria-describedby={undefined}
          onOpenAutoFocus={(event) => {
            // Radix would focus the panel; the caret belongs in the field.
            event.preventDefault();
            input.current?.focus();
          }}
          className={cn(
            'bg-raised border-line fixed inset-x-0 top-0 z-[60] border-b shadow-2xl sm:inset-x-12 sm:top-5 sm:rounded-3xl sm:border lg:inset-x-[calc((100vw-900px)/2)]',
            'motion-safe:data-[state=open]:animate-[mrd-slide-from-top_var(--duration-drawer)_var(--ease-out)]',
            'motion-safe:data-[state=closed]:animate-[mrd-slide-to-top_var(--duration-base)_var(--ease-in)]',
          )}
        >
          <RadixDialog.Title className="sr-only">Search</RadixDialog.Title>

          <div className="shell-max gutter py-3">
            <form
              onSubmit={(event) => {
                event.preventDefault();
                submit(query);
              }}
              role="search"
              className="flex items-center gap-2"
            >
              <div className="relative flex-1">
                <Search
                  className="text-faint pointer-events-none absolute left-4 top-1/2 size-[1.15rem] -translate-y-1/2"
                  aria-hidden
                />
                <input
                  ref={input}
                  type="search"
                  name="q"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search products, brands, stores…"
                  aria-label="Search products, brands, categories and stores"
                  autoComplete="off"
                  role="combobox"
                  aria-expanded={flat.length > 0}
                  aria-controls="search-results"
                  aria-activedescendant={active >= 0 ? `search-hit-${active}` : undefined}
                  onKeyDown={(event) => {
                    if (flat.length === 0) return;
                    if (event.key === 'ArrowDown') {
                      event.preventDefault();
                      setActive((index) => (index + 1) % flat.length);
                    }
                    if (event.key === 'ArrowUp') {
                      event.preventDefault();
                      setActive((index) => (index <= 0 ? flat.length - 1 : index - 1));
                    }
                    if (event.key === 'Enter' && active >= 0) {
                      // A highlighted row wins over the plain search the form
                      // would otherwise run.
                      event.preventDefault();
                      go(flat[active].href);
                    }
                  }}
                  className={cn(
                    'bg-sunken border-line-control text-ink placeholder:text-faint',
                    'h-12 w-full rounded-full border pl-12 pr-4 text-md',
                    'focus:border-accent-control focus:bg-raised focus:ring-4 focus:ring-accent/15',
                    'transition-[background-color,border-color,box-shadow] duration-(--duration-base)',
                  )}
                />
              </div>

              <RadixDialog.Close
                aria-label="Close search"
                className={cn(
                  'text-muted hover:bg-sunken hover:text-ink grid size-11 shrink-0 place-items-center',
                  'rounded-full transition-colors',
                  'focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-2',
                )}
              >
                <X className="size-5" aria-hidden />
              </RadixDialog.Close>
            </form>

            {/*
              Results, once there is something to search for.

              Everything below the fold of this panel is about NOT having a
              query -- recent searches, departments to fall into -- so the two
              states are mutually exclusive. Leaving the idle panel up under a
              half-typed word is how a search box ends up showing "recent:
              shoes" while somebody types "shirt".
            */}
            {term.length >= 2 ? (
              /*
                A listbox, because the field above is a combobox: that pairing
                is what lets a screen reader announce "3 of 14" as the arrows
                move, and it is why each row is an option rather than a plain
                link. They are still anchors underneath, so a middle-click
                opens a tab like any other result.
              */
              <div
                id="search-results"
                role="listbox"
                aria-label={`Results for ${term}`}
                className="mt-3 max-h-[70vh] overflow-y-auto pb-4"
              >
                {showing && showing.total > 0 ? (
                  <div className="grid gap-5 sm:grid-cols-2">
                    <HitGroup
                      heading="Products"
                      hits={showing.products}
                      offset={0}
                      active={active}
                      onPick={go}
                      onHover={setActive}
                      shape="square"
                    />
                    <div className="grid gap-5">
                      <HitGroup
                        heading="Brands"
                        hits={showing.brands}
                        offset={showing.products.length}
                        active={active}
                        onPick={go}
                        onHover={setActive}
                        shape="contain"
                      />
                      <HitGroup
                        heading="Categories"
                        hits={showing.categories}
                        offset={showing.products.length + showing.brands.length}
                        active={active}
                        onPick={go}
                        onHover={setActive}
                        shape="square"
                      />
                      <HitGroup
                        heading="Stores"
                        hits={showing.sellers}
                        offset={
                          showing.products.length +
                          showing.brands.length +
                          showing.categories.length
                        }
                        active={active}
                        onPick={go}
                        onHover={setActive}
                        shape="round"
                      />
                    </div>
                  </div>
                ) : searching ? (
                  <ResultsSkeleton />
                ) : (
                  <p className="text-muted px-3 py-6 text-sm">
                    Nothing matches <span className="text-ink font-medium">{term}</span> yet. Try
                    fewer words, or search the whole catalogue below.
                  </p>
                )}

                {/* Always available: the panel shows a handful, the page shows
                    everything, and a shopper must be able to get there. */}
                <button
                  type="button"
                  onClick={() => submit(term)}
                  className={cn(
                    'border-line text-ink hover:bg-sunken mt-3 flex min-h-12 w-full items-center',
                    'justify-between gap-3 rounded-md border px-3 text-sm transition-colors',
                  )}
                >
                  <span className="truncate">
                    Search everything for <span className="font-medium">{term}</span>
                  </span>
                  <CornerDownLeft className="text-faint size-4 shrink-0" aria-hidden />
                </button>
              </div>
            ) : (
              <div className="mt-4 grid gap-6 pb-4 sm:grid-cols-2">
                {recent.length > 0 ? (
                  <section>
                    <h2 className="eyebrow mb-2.5">Recent</h2>
                    <ul className="flex flex-wrap gap-1.5">
                      {recent.map((term) => (
                        <li key={term}>
                          <button
                            type="button"
                            onClick={() => submit(term)}
                            className={cn(
                              'border-line-control text-muted hover:border-line-bold hover:text-ink',
                              'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs',
                              'transition-colors motion-safe:active:scale-[0.96]',
                            )}
                          >
                            <Clock className="size-3.5 opacity-60" aria-hidden />
                            {term}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}

                {quickLinks.length > 0 ? (
                  <section>
                    <h2 className="eyebrow mb-2.5">Browse</h2>
                    <ul className="grid gap-0.5">
                      {quickLinks.map((link) => (
                        <li key={link.href}>
                          <a
                            href={link.href}
                            onClick={() => setOpen(false)}
                            className={cn(
                              'text-ink hover:bg-sunken group flex min-h-11 items-center justify-between',
                              'gap-3 rounded-md px-3 text-sm transition-colors',
                            )}
                          >
                            {link.label}
                            <ArrowUpRight
                              className="text-faint size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                              aria-hidden
                            />
                          </a>
                        </li>
                      ))}
                    </ul>
                  </section>
                ) : null}
              </div>
            )}
          </div>
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  );
}


/* --------------------------------------------------------------- results */

/**
 * One kind of result.
 *
 * `offset` is where this group starts in the flat keyboard list, so the arrow
 * keys and the eye agree about which row is highlighted. Rows are anchors, not
 * buttons: a result is a destination, and a shopper who middle-clicks or
 * long-presses one expects a link.
 */
function HitGroup({
  heading,
  hits,
  offset,
  active,
  onPick,
  onHover,
  shape,
}: {
  heading: string;
  hits: SearchHit[];
  offset: number;
  active: number;
  onPick: (href: string) => void;
  onHover: (index: number) => void;
  shape: 'square' | 'round' | 'contain';
}) {
  if (hits.length === 0) return null;

  return (
    <section role="group" aria-label={heading}>
      <h2 className="eyebrow mb-1.5">{heading}</h2>
      <ul>
        {hits.map((hit, index) => {
          const position = offset + index;
          const highlighted = position === active;

          return (
            <li key={hit.id}>
              <a
                id={`search-hit-${position}`}
                role="option"
                href={hit.href}
                onClick={(event) => {
                  // Plain clicks route in the app; modified clicks are the
                  // browser's to handle, and it does it better.
                  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
                  event.preventDefault();
                  onPick(hit.href);
                }}
                onMouseMove={() => onHover(position)}
                aria-selected={highlighted}
                className={cn(
                  'flex min-h-14 items-center gap-3 rounded-xl px-3 py-2 transition-[background-color,transform] duration-150',
                  highlighted ? 'bg-accent-soft text-accent-ink' : 'hover:bg-sunken hover:translate-x-0.5',
                )}
              >
                <span
                  className={cn(
                    'bg-sunken relative size-10 shrink-0 overflow-hidden',
                    shape === 'round' ? 'rounded-full' : 'rounded-md',
                  )}
                >
                  {hit.imageUrl ? (
                    <Image
                      src={hit.imageUrl}
                      alt=""
                      fill
                      sizes="40px"
                      className={shape === 'contain' ? 'object-contain p-1' : 'object-cover'}
                    />
                  ) : null}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="text-ink block truncate text-sm">{hit.label}</span>
                  {hit.hint ? (
                    <span className="text-faint block truncate text-2xs capitalize">{hit.hint}</span>
                  ) : null}
                </span>

                {hit.price ? (
                  <span className="text-ink shrink-0 text-xs font-medium">
                    {formatMoney(hit.price)}
                  </span>
                ) : (
                  <ArrowUpRight className="text-faint size-4 shrink-0" aria-hidden />
                )}
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** The shape of a result list, while the first one is being fetched. */
function ResultsSkeleton() {
  return (
    <div className="grid gap-5 sm:grid-cols-2" aria-hidden>
      {[0, 1].map((column) => (
        <div key={column} className="space-y-2">
          <div className="skeleton h-3 w-20 rounded" />
          {[0, 1, 2].map((row) => (
            <div key={row} className="flex items-center gap-3">
              <div className="skeleton size-10 shrink-0 rounded-md" />
              <div className="min-w-0 flex-1 space-y-1.5">
                <div className="skeleton h-3.5 w-2/3 rounded" />
                <div className="skeleton h-2.5 w-1/3 rounded" />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
