import { Star } from 'lucide-react';
import Link from 'next/link';

import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import type { HomeSection, Seller } from '@/domain/types';
import { cn } from '@/lib/cn';
import { formatCompactNumber, formatRating } from '@/lib/format';
import { staggerIndex } from '@/lib/motion';

import { Section } from './section';

/**
 * Seller spotlight.
 *
 * The section that makes a MARKETPLACE feel like a marketplace rather than a
 * shop with a lot of stock. It exists to answer "who am I actually buying
 * from", which on a multi-vendor site is the question that decides the sale.
 *
 * So the three numbers at the foot of each card are chosen for exactly that:
 * rating (are they good), styles (are they real), orders shipped (have they
 * done this before). Not revenue, not follower counts — the numbers a buyer
 * would ask for.
 *
 * `<dl>` rather than three divs, because they genuinely are term/value pairs
 * and a screen reader announcing "Rating 4.7, Styles 82, Orders 12.4K" is the
 * whole content of the row. The visible labels are abbreviated; the `<dt>`
 * carries the full word.
 */
export function SellerSpotlight({
  section,
  sellers,
}: {
  section: HomeSection;
  sellers: Seller[];
}) {
  if (sellers.length === 0) return null;

  return (
    <Section
      title={section.title}
      subtitle={section.subtitle}
      href={section.href}
      ctaLabel="All sellers"
    >
      <ul className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {sellers.map((seller, index) => (
          <li key={seller.id} style={staggerIndex(index)}>
            <Link
              href={`/store/${seller.slug}`}
              className={cn(
                'border-line bg-raised group flex h-full flex-col rounded-xl border p-5',
                /*
                 * `lift` rather than a hand-rolled `hover:shadow-md`.
                 *
                 * `box-shadow` is not a compositable property, so animating it
                 * re-rasterises the card on every frame of the hover. The
                 * utility parks the larger shadow on a pseudo-element at zero
                 * opacity and cross-fades that instead, which the compositor
                 * does for free — and it carries the 3px travel, so the
                 * translate does not need restating here.
                 */
                'lift transition-[border-color] duration-(--duration-base) ease-(--ease-out)',
                'hover:border-line-strong',
                'focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-2',
              )}
            >
              <div className="flex items-start gap-3">
                <Avatar name={seller.displayName} src={seller.logoUrl} size="md" square />

                <div className="min-w-0 flex-1">
                  <h3 className="font-display text-ink truncate text-md font-semibold leading-tight">
                    {seller.displayName}
                  </h3>
                  {seller.tagline ? (
                    <p className="text-faint mt-0.5 truncate text-2xs">{seller.tagline}</p>
                  ) : null}
                </div>

                {seller.rating.average >= 4.5 ? (
                  <Badge tone="success" size="sm" pill className="shrink-0">
                    Top rated
                  </Badge>
                ) : null}
              </div>

              <p className="text-muted clamp-3 mt-3.5 flex-1 text-sm">{seller.about}</p>

              <dl className="border-line text-faint mt-4 flex gap-5 border-t pt-3.5 text-2xs">
                <div>
                  <dt className="sr-only">Rating</dt>
                  <dd className="tabular flex items-center gap-1">
                    <Star className="text-sand-500 size-3 fill-current" aria-hidden />
                    <span className="text-ink font-semibold">
                      {formatRating(seller.rating.average)}
                    </span>
                  </dd>
                </div>
                <div>
                  <dt className="sr-only">Styles listed</dt>
                  <dd className="tabular">
                    <span className="text-ink font-semibold">
                      {formatCompactNumber(seller.metrics.liveProductCount)}
                    </span>{' '}
                    styles
                  </dd>
                </div>
                <div>
                  <dt className="sr-only">Orders shipped</dt>
                  <dd className="tabular">
                    <span className="text-ink font-semibold">
                      {formatCompactNumber(seller.metrics.orderCount)}
                    </span>{' '}
                    orders
                  </dd>
                </div>
              </dl>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}
