import { PackageOpen } from 'lucide-react';
import Link from 'next/link';

import { ProductCard } from '@/components/commerce/product-card';
import { Button } from '@/components/ui/button';
import type { ProductSummary } from '@/domain/types';
import { cn } from '@/lib/cn';

/**
 * Product grid.
 *
 * Handles the empty case itself rather than leaving each caller to remember it,
 * which is how a filtered listing ends up rendering a silent blank panel.
 *
 * The first four cards get `priority`, so the LCP image on a listing page is
 * fetched eagerly while everything below the fold stays lazy.
 */
export function ProductGrid({
  products,
  emptyAction,
  className,
}: {
  products: ProductSummary[];
  /** Where to send someone whose filters returned nothing. */
  emptyAction?: { href: string; label: string };
  className?: string;
}) {
  if (products.length === 0) {
    return (
      <div className="border-line flex flex-col items-center rounded-lg border border-dashed px-6 py-16 text-center">
        <PackageOpen className="text-faint size-8" aria-hidden />
        <h2 className="text-ink mt-4 text-md font-semibold">Nothing matches those filters</h2>
        <p className="text-muted mt-1.5 max-w-sm text-sm">
          Try removing a filter or two — colour and size together often narrow things further than
          expected.
        </p>
        {emptyAction ? (
          <Button asChild variant="secondary" size="sm" className="mt-5">
            <Link href={emptyAction.href}>{emptyAction.label}</Link>
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <ul
      className={cn(
        'grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5',
        className,
      )}
    >
      {products.map((product, index) => (
        <li key={product.id}>
          <ProductCard product={product} priority={index < 4} />
        </li>
      ))}
    </ul>
  );
}
