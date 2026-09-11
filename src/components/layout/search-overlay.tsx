'use client';

import * as RadixDialog from '@radix-ui/react-dialog';
import { ArrowUpRight, Clock, Search, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { cn } from '@/lib/cn';

/**
 * Search.
 *
 * One overlay for every width, opened from the header's search control or by
 * pressing `/` anywhere on the storefront. A separate mobile search PAGE was
 * the alternative and it is worse in the way that matters: it is a navigation,
 * so it loses the page the shopper was on, and coming back means a history
 * entry that does nothing.
 *
 * What is here and what deliberately is not:
 *
 *   here      the query, recent searches, and a short list of departments to
 *             fall into when someone opens search without a word in mind
 *   not here  live suggestions. There is no suggestion endpoint in this
 *             codebase, and a panel that fakes them with client-side substring
 *             matching over a partial catalogue is worse than none: it
 *             confidently shows three results and hides the four hundred the
 *             real search would have found.
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
              'rounded-full border pl-3.5 pr-2.5 text-sm lg:flex xl:w-64',
              'hover:border-line-bold hover:text-muted transition-colors',
              'focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-2',
            )}
          >
            <Search className="size-4 shrink-0" aria-hidden />
            <span className="hidden xl:inline">Search products</span>
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
  const input = useRef<HTMLInputElement>(null);

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
            'bg-raised border-line fixed inset-x-0 top-0 z-[60] border-b shadow-xl',
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
                  placeholder="Search for kurtas, sneakers, brands…"
                  aria-label="Search products"
                  autoComplete="off"
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
              The panel below the field.

              Hidden entirely once there is a query, because everything in it
              is about NOT having one. Leaving it up under a half-typed word is
              how a search panel ends up showing "recent: shoes" while someone
              is typing "shirt".
            */}
            {query.trim() ? null : (
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
