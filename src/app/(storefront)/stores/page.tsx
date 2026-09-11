import { Store } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';

import { Breadcrumbs } from '@/components/commerce/breadcrumbs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { absoluteUrl } from '@/config/site';
import { formatCompactNumber, formatRating } from '@/lib/format';
import { listSellers } from '@/server/services/catalog';

export const metadata: Metadata = {
  title: 'Sellers on VestraWAB',
  description:
    'The independent labels, workshops and family businesses selling on VestraWAB, each reviewed by our team before it can sell.',
  alternates: { canonical: absoluteUrl('/stores') },
};

/**
 * Seller directory.
 *
 * Exists for two reasons: shoppers who liked something want to find the maker
 * again, and every store page needs an internal link from somewhere crawlable.
 *
 * Stores with something to buy come first. A newly approved store still shows,
 * marked as opening soon, rather than with a row of zeros that reads as a store
 * nobody buys from.
 */
export default async function StoresPage() {
  const sellers = await listSellers(100);
  const ordered = [...sellers].sort(
    (a, b) => Number(b.metrics.liveProductCount > 0) - Number(a.metrics.liveProductCount > 0),
  );

  return (
    <div className="gutter shell-max py-5">
      <Breadcrumbs items={[{ href: '/', label: 'Home' }, { href: '/stores', label: 'Sellers' }]} />

      <header className="mt-3">
        <h1 className="font-display text-ink text-2xl sm:text-3xl">Sellers on VestraWAB</h1>
        <p className="text-muted mt-2 max-w-2xl text-sm">
          Independent labels, workshops and family businesses selling direct. Our team reviews
          every store before it can sell.
        </p>
      </header>

      {ordered.length === 0 ? (
        <div className="border-line mt-8 rounded-xl border border-dashed">
          <EmptyState
            icon={Store}
            title="No stores open yet"
            body="The first sellers are setting up. If you make something worth selling, you could be one of them."
            action={
              <Button asChild size="sm" shape="pill">
                <Link href="/sell-with-us">Sell on VestraWAB</Link>
              </Button>
            }
          />
        </div>
      ) : (
        <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {ordered.map((seller) => {
            const open = seller.metrics.liveProductCount > 0;
            const facts = [
              seller.kyc.registeredAddress.city,
              seller.rating.count > 0 ? `${formatRating(seller.rating.average)}★` : null,
              seller.metrics.orderCount > 0 ? `${formatCompactNumber(seller.metrics.orderCount)} orders` : null,
              open ? `${formatCompactNumber(seller.metrics.liveProductCount)} styles` : null,
            ].filter(Boolean);

            return (
              <li key={seller.id}>
                <Link
                  href={`/store/${seller.slug}`}
                  className="border-line bg-raised hover:border-accent-line flex h-full flex-col rounded-lg border p-5 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="text-ink text-sm font-semibold">{seller.displayName}</h2>
                    {!open ? (
                      <Badge tone="neutral" size="sm">
                        Opening soon
                      </Badge>
                    ) : seller.rating.count > 0 && seller.rating.average >= 4.5 ? (
                      <Badge tone="success" size="sm">
                        Top rated
                      </Badge>
                    ) : null}
                  </div>

                  {seller.tagline ? (
                    <p className="text-accent-ink mt-1 text-xs">{seller.tagline}</p>
                  ) : null}

                  <p className="text-muted clamp-3 mt-2 flex-1 text-sm">
                    {seller.about || 'A new store on VestraWAB. Its first products are on the way.'}
                  </p>

                  {facts.length > 0 ? <p className="text-faint mt-4 text-2xs">{facts.join(' · ')}</p> : null}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
