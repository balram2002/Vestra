import { PackageOpen } from 'lucide-react';
import Link from 'next/link';

import { ProductCard } from '@/components/commerce/product-card';
import { WishlistButton } from '@/components/commerce/wishlist-button';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import type { ProductSummary } from '@/domain/types';
import { cn } from '@/lib/cn';
import { staggerIndex } from '@/lib/motion';

/**
 * Product grid.
 *
 * Handles the empty case itself rather than leaving each caller to remember it,
 * which is how a filtered listing ends up rendering a silent blank panel.
 *
 * The first four cards get `priority`, so the LCP image on a listing page is
 * fetched eagerly while everything below the fold stays lazy.
 *
 * ON THE SAVE HEART, and why it is here and not on the home rails:
 *
 * `savedIds` is optional and the heart only appears when it is supplied. That
 * is a deliberate split rather than an oversight. Knowing whether a product is
 * saved means reading the session, which makes the surface dynamic — fine on a
 * listing, which already awaits `searchParams` and is dynamic anyway, and
 * ruinous on the home page, where every rail is cached and shared across
 * visitors.
 *
 * It also matches how the two surfaces are used: a listing is where someone
 * COMPARES and shortlists several things, and a home rail is where they tap
 * through to one. Putting a save control on the compare surface and leaving the
 * browse surface clean is the right call independently of the caching.
 */
export function ProductGrid({
  products,
  savedIds,
  emptyAction,
  className,
}: {
  products: ProductSummary[];
  /** Product ids already on the viewer's list. Omit to hide the save control. */
  savedIds?: ReadonlySet<string>;
  /** Where to send someone whose filters returned nothing. */
  emptyAction?: { href: string; label: string };
  className?: string;
}) {
  if (products.length === 0) {
    return (
      <div className="border-line rounded-xl border border-dashed">
        <EmptyState
          icon={PackageOpen}
          title="Nothing matches those filters"
          body="Try removing a filter or two — colour and size together often narrow things further than expected."
          action={
            emptyAction ? (
              <Button asChild variant="secondary" size="sm" shape="pill">
                <Link href={emptyAction.href}>{emptyAction.label}</Link>
              </Button>
            ) : null
          }
        />
      </div>
    );
  }

  return (
    <ul
      className={cn(
        'stagger grid grid-cols-2 gap-x-3 gap-y-8 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5',
        className,
      )}
    >
      {products.map((product, index) => (
        /*
          A staggered entrance, capped by the `.stagger` utility at eight.

          The delay is handed down as `--i` so the sequence is CSS, not a
          JavaScript timer, and the whole thing is inert under
          `prefers-reduced-motion`. Past the eighth card the delay stops growing
          — otherwise the fortieth product would wait 1.8s to appear, which is
          lag wearing a costume.

          Deliberately a STOREFRONT-only flourish; the consoles never stagger.
        */
        <li key={product.id} style={staggerIndex(index)}>
          <ProductCard
            product={product}
            priority={index < 4}
            action={
              savedIds ? (
                <WishlistButton
                  productId={product.id}
                  productTitle={product.title}
                  initialSaved={savedIds.has(product.id)}
                  size="md"
                />
              ) : null
            }
          />
        </li>
      ))}
    </ul>
  );
}
