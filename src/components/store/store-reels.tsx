import { Play } from 'lucide-react';
import Link from 'next/link';

import { Picture } from '@/components/ui/picture';
import type { ProductSummary } from '@/domain/types';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/format';
import { staggerIndex } from '@/lib/motion';

/**
 * A store's products as a wall of reels.
 *
 * Portrait 9:16 tiles, the shape a shopper who found the store on Instagram
 * already reads as "tap to watch". The tile opens the product; the play mark,
 * when it is on, opens the product's demo -- the closest thing a listing has
 * to a clip. Two separate links, never one inside the other.
 *
 *   roomy   two up on a phone, five on a wide screen, rounded cards (Spotlight)
 *   tight   three up at every width with hairline gaps, a profile grid (Studio)
 *
 * No autoplay, for the same reason as the homepage reel strip: a page of
 * decoders behind the fold is a flat battery.
 */
export function StoreReels({
  products,
  density = 'roomy',
  showPrices = true,
  showPlay = true,
  className,
}: {
  products: ProductSummary[];
  density?: 'roomy' | 'tight';
  showPrices?: boolean;
  showPlay?: boolean;
  className?: string;
}) {
  const tight = density === 'tight';

  return (
    <ul
      className={cn(
        'stagger grid',
        tight
          ? 'grid-cols-3 gap-0.5 sm:gap-1'
          : 'grid-cols-2 gap-2.5 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5',
        className,
      )}
    >
      {products.map((product, index) => (
        <li key={product.id} style={staggerIndex(index)} className="group relative">
          <div
            className={cn(
              'relative overflow-hidden bg-sunken',
              tight ? 'rounded-sm' : 'rounded-2xl ring-1 ring-inset ring-black/[0.07]',
            )}
          >
            <Picture
              src={product.primaryImage}
              name={product.title}
              sizes={tight ? '33vw' : '(max-width: 40rem) 50vw, (max-width: 64rem) 33vw, 20vw'}
              className="aspect-9/16"
              imageClassName="transition-transform duration-(--duration-hero) ease-out motion-safe:group-hover:scale-[1.04]"
            />

            <span
              aria-hidden
              className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-transparent"
            />

            <Link
              href={`/product/${product.slug}`}
              className="absolute inset-0 z-[1] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-white"
              aria-label={`${product.title}, ${formatMoney(product.sellingPrice)}`}
            />

            {showPlay && product.demoPath ? (
              <Link
                href={product.demoPath}
                aria-label={`Watch ${product.title}`}
                className={cn(
                  'absolute z-[2] grid place-items-center rounded-full bg-white/90 text-black shadow-sm',
                  'transition-transform duration-(--duration-base) hover:scale-110',
                  tight ? 'right-1.5 top-1.5 size-7' : 'right-2.5 top-2.5 size-9',
                )}
              >
                <Play className={cn('fill-current', tight ? 'size-3' : 'size-3.5')} aria-hidden />
              </Link>
            ) : null}

            {product.discountPercent >= 10 && showPrices && !tight ? (
              <span className="bg-accent text-on-accent absolute left-2.5 top-2.5 rounded-full px-2 py-0.5 text-2xs font-bold">
                {product.discountPercent}% off
              </span>
            ) : null}

            {showPrices ? (
              <div
                className={cn(
                  'pointer-events-none absolute inset-x-0 bottom-0 text-white',
                  tight ? 'p-1.5 sm:p-2.5' : 'p-3',
                )}
              >
                {!tight ? (
                  <p className="line-clamp-2 text-xs font-medium leading-snug drop-shadow sm:text-sm">
                    {product.title}
                  </p>
                ) : null}
                <p className={cn('flex items-baseline gap-1.5', !tight && 'mt-1')}>
                  <span className={cn('font-bold', tight ? 'text-2xs sm:text-sm' : 'text-sm sm:text-base')}>
                    {formatMoney(product.sellingPrice)}
                  </span>
                  {product.mrp > product.sellingPrice && !tight ? (
                    <span className="text-2xs text-white/70 line-through">{formatMoney(product.mrp)}</span>
                  ) : null}
                </p>
              </div>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
