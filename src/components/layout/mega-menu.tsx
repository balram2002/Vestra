import { ArrowRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import type { Category } from '@/domain/types';
import { cn } from '@/lib/cn';
import { formatCompactNumber } from '@/lib/format';

/**
 * Department mega menu.
 *
 * A Server Component driven entirely by the taxonomy — the menu cannot drift
 * from the catalogue because it IS the catalogue. Adding a shelf in the admin
 * console puts it here on the next `revalidateTag('taxonomy')`.
 *
 * Opening is CSS-ONLY: `group-hover` plus `group-focus-within`. That is worth
 * more than it sounds. The navigation is the single most-rendered thing in the
 * shop, it appears on every page, and this way it ships zero JavaScript, works
 * before hydration, and cannot be broken by a hydration error somewhere else on
 * the page. `focus-within` is what makes it keyboard-operable without a
 * JavaScript menu implementation.
 *
 * The panel animates on `opacity` and `translateY` with `visibility` stepped at
 * the end, never on `display`. `display: none` cannot be transitioned, so a
 * menu built on it appears and vanishes instantly; `visibility` can be delayed
 * so it stays hittable for the length of the fade out and then stops
 * intercepting the pointer.
 *
 * `static` on the list item and `inset-x-0` on the panel is what makes the
 * panel span the viewport rather than the width of the word it hangs from — the
 * item deliberately gives up being the positioning context.
 */
export function MegaMenu({
  menu,
}: {
  menu: Array<{ department: Category; groups: Array<{ shelf: Category; leaves: Category[] }> }>;
}) {
  return (
    <nav aria-label="Departments" className="hidden h-full min-w-0 lg:block">
      <ul className="flex h-full items-stretch">
        {menu.map(({ department, groups }) => (
          <li key={department.id} className="group static flex items-stretch">
            <Link
              href={`/category/${department.slug}`}
              className={cn(
                'text-ink group-hover:text-accent-ink relative flex items-center px-3.5',
                'text-xs font-semibold uppercase tracking-[0.09em] transition-colors xl:px-4',
              )}
            >
              {department.name}
              {/*
                The underline grows from the centre rather than sliding in from
                one side: a menu of six items where every underline enters from
                the left reads as a conveyor belt.
              */}
              <span
                aria-hidden
                className={cn(
                  'bg-accent absolute inset-x-3 bottom-0 h-[2px] origin-center scale-x-0 rounded-full',
                  'transition-transform duration-(--duration-slow) ease-(--ease-out)',
                  'group-hover:scale-x-100 group-focus-within:scale-x-100',
                )}
              />
            </Link>

            {groups.length > 0 ? (
              <div
                role="group"
                aria-label={department.name}
                className={cn(
                  'bg-raised border-line absolute inset-x-0 top-full z-40 border-y shadow-lg',
                  'invisible -translate-y-2 opacity-0',
                  'transition-[opacity,transform,visibility] duration-(--duration-base) ease-(--ease-out)',
                  /*
                   * HOVER INTENT, in one line of CSS.
                   *
                   * Without a delay, dragging the pointer from "Women" to the
                   * search field flashes three full-width panels open and shut
                   * on the way past. The usual fix is a JavaScript timer, which
                   * would cost this component its whole reason for being a
                   * Server Component.
                   *
                   * Instead the delay lives on the HOVER state only. Entering,
                   * the hover rule applies and the panel waits 130ms before
                   * opening — long enough that a pass-through never triggers
                   * it. Leaving, the hover rule stops applying, so the base
                   * rule's zero delay takes over and it closes at once. An
                   * asymmetric delay from a symmetric property, because the two
                   * directions are described by two different rules.
                   *
                   * Focus is deliberately NOT delayed: a keyboard user has
                   * already committed by tabbing to it, and 130ms of nothing
                   * after a Tab reads as a broken menu.
                   */
                  'group-hover:visible group-hover:translate-y-0 group-hover:opacity-100',
                  'group-hover:[transition-delay:130ms]',
                  'group-focus-within:visible group-focus-within:translate-y-0 group-focus-within:opacity-100',
                  'group-focus-within:[transition-delay:0ms]',
                )}
              >
                <div className="shell-max gutter grid grid-cols-4 gap-x-8 gap-y-7 py-8 xl:grid-cols-5">
                  {groups.map(({ shelf, leaves }, column) => (
                    /*
                     * Each column arrives a beat after the one before it.
                     *
                     * 28ms apart and capped at four columns' worth, so the last
                     * one is at most 112ms behind the first. A navigation menu
                     * has to feel instant once it has committed to opening;
                     * anything slower stops reading as sequence and starts
                     * reading as lag on every single hover, all day.
                     *
                     * The delay is handed to `.mega-col` in `global.css` as a
                     * custom property rather than set inline, and that is
                     * load-bearing: an inline `transition-delay` applies to BOTH
                     * directions, so the columns would also take that long to
                     * leave. The rule applies the delay only under
                     * `:hover`/`:focus-within`, so entering is staggered and
                     * exiting is immediate.
                     *
                     * It cannot be a Tailwind arbitrary variant either — a class
                     * built from a runtime value never reaches the compiled
                     * stylesheet.
                     */
                    <div
                      key={shelf.id}
                      className="mega-col min-w-0"
                      style={
                        {
                          '--col-delay': `${Math.min(column, 4) * 28}ms`,
                        } as React.CSSProperties
                      }
                    >
                      <Link
                        href={`/category/${shelf.slug}`}
                        className="text-ink hover:text-accent-ink text-2xs font-semibold uppercase tracking-[0.14em]"
                      >
                        {shelf.name}
                      </Link>
                      <ul className="mt-3.5 space-y-2.5">
                        {leaves.map((leaf) => (
                          <li key={leaf.id}>
                            <Link
                              href={`/category/${leaf.slug}`}
                              className={cn(
                                'text-muted hover:text-ink inline-block text-sm transition-[color,transform]',
                                'duration-(--duration-fast) hover:translate-x-0.5',
                              )}
                            >
                              {leaf.name}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}

                  {/*
                    The feature tile.

                    A mega menu that is only lists is a sitemap. One image gives
                    the panel a focal point and gives the department a face —
                    and it is the department's OWN image, so it needs no
                    editorial process and cannot go stale independently of the
                    catalogue.
                  */}
                  <Link
                    href={`/category/${department.slug}`}
                    className="group/tile relative flex min-h-40 flex-col justify-end overflow-hidden rounded-lg"
                  >
                    {department.imageUrl ? (
                      <Image
                        src={department.imageUrl}
                        alt=""
                        fill
                        sizes="20rem"
                        className="object-cover transition-transform duration-(--duration-hero) ease-out motion-safe:group-hover/tile:scale-105"
                      />
                    ) : (
                      <span aria-hidden className="bg-sunken absolute inset-0" />
                    )}

                    <span aria-hidden className="scrim absolute inset-0" />

                    <span className="relative p-4">
                      <span className="font-display block text-lg font-semibold text-white">
                        {department.name}
                      </span>
                      <span className="mt-1 flex items-center gap-1.5 text-2xs text-white/80">
                        Shop all {formatCompactNumber(department.productCount)} items
                        <ArrowRight
                          className="size-3.5 transition-transform group-hover/tile:translate-x-0.5"
                          aria-hidden
                        />
                      </span>
                    </span>
                  </Link>
                </div>
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </nav>
  );
}
