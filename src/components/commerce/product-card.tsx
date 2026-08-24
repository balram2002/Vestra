import Image from 'next/image';
import Link from 'next/link';

import { Badge } from '@/components/ui/badge';
import type { ProductBadgeKind, ProductSummary, Tone } from '@/domain/types';
import { cn } from '@/lib/cn';

import { PriceBlock } from './price-block';
import { RatingStars } from './rating-stars';

/**
 * Product card.
 *
 * The most-repeated component in the shop, so it is a Server Component with no
 * client JavaScript at all: a 48-card grid that hydrates is a measurable INP
 * cost for a surface whose only job is to link somewhere. Interactive affordances
 * (wishlist toggle, quick add) are separate client islands dropped in as
 * children, so the card itself stays static.
 *
 * Layout notes that exist to protect Core Web Vitals:
 *  - the image well is a fixed 3:4 aspect ratio, so the grid reserves its final
 *    height before any image loads and CLS stays at zero;
 *  - `sizes` is declared per breakpoint, so a phone downloads a phone-sized
 *    image rather than the 900px one;
 *  - the title is clamped to two lines, so a long name cannot push the price
 *    row out of alignment with its neighbours.
 */

const BADGE_TONE: Record<ProductBadgeKind, Tone> = {
  NEW: 'info',
  BESTSELLER: 'accent',
  TRENDING: 'accent',
  LOW_STOCK: 'danger',
  DEAL: 'danger',
  PREMIUM: 'brass',
  SPONSORED: 'neutral',
  BACK_IN_STOCK: 'success',
};

export interface ProductCardProps {
  product: ProductSummary;
  /**
   * Set on the first few cards above the fold so the LCP image is not
   * lazy-loaded. Everything below the fold must leave this false.
   */
  priority?: boolean;
  /** Interactive island, e.g. the wishlist heart. */
  action?: React.ReactNode;
  className?: string;
}

export function ProductCard({ product, priority = false, action, className }: ProductCardProps) {
  const soldOut = product.stockLevel === 'OUT_OF_STOCK';

  return (
    <article className={cn('group relative flex flex-col', className)}>
      <div className="bg-sunken relative aspect-[3/4] overflow-hidden rounded-md">
        <Link href={`/product/${product.slug}`} tabIndex={-1} aria-hidden className="block h-full">
          <Image
            src={product.primaryImage}
            alt={product.title}
            fill
            priority={priority}
            loading={priority ? undefined : 'lazy'}
            sizes="(max-width: 40rem) 50vw, (max-width: 64rem) 33vw, (max-width: 96rem) 25vw, 280px"
            className={cn(
              'object-cover transition-opacity duration-300',
              // The second shot is revealed on hover rather than swapped in, so
              // there is no request on hover and no flash of empty space.
              product.hoverImage ? 'group-hover:opacity-0' : '',
              soldOut ? 'opacity-60' : '',
            )}
          />
          {product.hoverImage ? (
            <Image
              src={product.hoverImage}
              alt=""
              aria-hidden
              fill
              loading="lazy"
              sizes="(max-width: 40rem) 50vw, (max-width: 64rem) 33vw, (max-width: 96rem) 25vw, 280px"
              className="pointer-events-none object-cover opacity-0 transition-opacity duration-300 group-hover:opacity-100"
            />
          ) : null}
        </Link>

        {product.badges.length > 0 ? (
          <div className="pointer-events-none absolute left-2 top-2 flex flex-col items-start gap-1">
            {product.badges.map((badge) => (
              <Badge key={badge.kind} tone={BADGE_TONE[badge.kind]} size="sm" solid>
                {badge.label}
              </Badge>
            ))}
          </div>
        ) : null}

        {soldOut ? (
          <div className="bg-canvas/85 absolute inset-x-0 bottom-0 py-1.5 text-center">
            <span className="text-ink text-xs font-medium">Sold out</span>
          </div>
        ) : null}

        {action ? <div className="absolute right-2 top-2">{action}</div> : null}
      </div>

      <div className="flex flex-1 flex-col gap-1 pt-2.5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-ink text-xs font-semibold uppercase tracking-wide">
            {product.brandName}
          </p>
          <RatingStars rating={product.rating} count={product.ratingCount} />
        </div>

        {/*
          The whole card is clickable via this stretched link, which keeps the
          accessible name on the product title rather than on a bare wrapper.
        */}
        <h3 className="text-muted clamp-2 text-sm">
          <Link href={`/product/${product.slug}`} className="after:absolute after:inset-0">
            {product.title}
          </Link>
        </h3>

        <PriceBlock
          sellingPrice={product.sellingPrice}
          mrp={product.mrp}
          discountPercent={product.discountPercent}
          className="mt-0.5"
        />

        {product.colorOptions.length > 1 ? (
          <p className="text-faint text-2xs mt-0.5">
            {product.colorOptions.length} colours
          </p>
        ) : null}
      </div>
    </article>
  );
}
