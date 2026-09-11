import type { Metadata } from 'next';
import Link from 'next/link';

import { Breadcrumbs } from '@/components/commerce/breadcrumbs';
import { Badge } from '@/components/ui/badge';
import { absoluteUrl } from '@/config/site';
import { listBrands } from '@/server/services/catalog';

export const metadata: Metadata = {
  title: 'Brands',
  description:
    'Every label stocked on VestraWAB, from block-print cotton workshops to Goodyear-welted shoemakers.',
  alternates: { canonical: absoluteUrl('/brands') },
};

/**
 * Brand index.
 *
 * Grouped alphabetically rather than by popularity: someone on this page is
 * looking for a name they already have in mind, and a popularity ordering makes
 * that harder, not easier.
 */
export default async function BrandsPage() {
  const brands = await listBrands(200);

  const groups = new Map<string, typeof brands>();
  for (const brand of [...brands].sort((a, b) => a.name.localeCompare(b.name))) {
    const letter = brand.name.charAt(0).toUpperCase();
    groups.set(letter, [...(groups.get(letter) ?? []), brand]);
  }

  return (
    <div className="gutter shell-max py-5">
      <Breadcrumbs items={[{ href: '/', label: 'Home' }, { href: '/brands', label: 'Brands' }]} />

      <header className="mt-3">
        <h1 className="font-display text-ink text-2xl sm:text-3xl">Brands</h1>
        <p className="text-muted mt-2 max-w-2xl text-sm">
          {brands.length} labels, from block-print cotton workshops in Bagru to Goodyear-welted
          shoemakers in Kanpur.
        </p>
      </header>

      <div className="mt-8 space-y-8">
        {Array.from(groups.entries()).map(([letter, entries]) => (
          <section key={letter}>
            <h2 className="text-faint border-line border-b pb-1.5 text-xs font-semibold uppercase tracking-wider">
              {letter}
            </h2>
            <ul className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2 lg:grid-cols-4">
              {entries.map((brand) => (
                <li key={brand.id}>
                  {/*
                    The name, the Premium mark and the count all sat inside the
                    link with nothing between them, so the accessible name came
                    out as "Ash & OakPremium40". Stating it explicitly is the
                    only way to get a name a person could be told to look for.
                  */}
                  <Link
                    href={`/brand/${brand.slug}`}
                    aria-label={`${brand.name}${brand.isPremium ? ', premium brand' : ''}, ${brand.productCount} products`}
                    className="group flex min-h-11 items-center justify-between gap-2 lg:min-h-0 lg:py-1"
                  >
                    <span className="text-ink group-hover:text-accent-ink text-sm transition-colors">
                      {brand.name}
                    </span>
                    <span className="flex items-center gap-1.5" aria-hidden>
                      {brand.isPremium ? (
                        <Badge tone="premium" size="sm">
                          Premium
                        </Badge>
                      ) : null}
                      <span className="text-faint tabular text-2xs">{brand.productCount}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </div>
  );
}
