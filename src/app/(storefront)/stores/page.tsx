import type { Metadata } from 'next';
import Link from 'next/link';

import { Breadcrumbs } from '@/components/commerce/breadcrumbs';
import { Badge } from '@/components/ui/badge';
import { absoluteUrl } from '@/config/site';
import { formatCompactNumber } from '@/lib/format';
import { listSellers } from '@/server/services/catalog';

export const metadata: Metadata = {
  title: 'Sellers on Vestra',
  description:
    'Every store on Vestra is GST-registered and KYC-verified before its first listing goes live. Browse the independent labels and workshops selling direct.',
  alternates: { canonical: absoluteUrl('/stores') },
};

/**
 * Seller directory.
 *
 * Exists for two reasons: shoppers who liked something want to find the maker
 * again, and every store page needs an internal link from somewhere crawlable.
 */
export default async function StoresPage() {
  const sellers = await listSellers(100);

  return (
    <div className="gutter shell-max py-5">
      <Breadcrumbs items={[{ href: '/', label: 'Home' }, { href: '/stores', label: 'Sellers' }]} />

      <header className="mt-3">
        <h1 className="font-display text-ink text-2xl sm:text-3xl">Sellers on Vestra</h1>
        <p className="text-muted mt-2 max-w-2xl text-sm">
          Independent labels, workshops and family businesses selling direct. Every one is
          GST-registered and KYC-verified before their first listing goes live.
        </p>
      </header>

      <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {sellers.map((seller) => (
          <li key={seller.id}>
            <Link
              href={`/store/${seller.slug}`}
              className="border-line bg-raised hover:border-accent-line flex h-full flex-col rounded-lg border p-5 transition-colors"
            >
              <div className="flex items-start justify-between gap-2">
                <h2 className="text-ink text-sm font-semibold">{seller.displayName}</h2>
                {seller.rating.average >= 4.5 ? (
                  <Badge tone="success" size="sm">
                    Top rated
                  </Badge>
                ) : null}
              </div>

              {seller.tagline ? (
                <p className="text-accent-ink mt-1 text-xs">{seller.tagline}</p>
              ) : null}

              <p className="text-muted clamp-3 mt-2 flex-1 text-sm">{seller.about}</p>

              <p className="text-faint mt-4 text-2xs">
                {seller.kyc.registeredAddress.city} · {seller.rating.average}★ ·{' '}
                {formatCompactNumber(seller.metrics.orderCount)} orders ·{' '}
                {seller.metrics.liveProductCount} styles
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
