import Image from 'next/image';
import Link from 'next/link';

import type { ProductBadgeKind, ProductSummary } from '@/domain/types';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/format';

import { RatingStars } from './rating-stars';

/**
 * Product card.
 *
 * The most-repeated component in the shop, so it is a Server Component with no
 * client JavaScript at all: a 48-card grid that hydrates is a measurable INP
 * cost for a surface whose only job is to link somewhere. Interactive
 * affordances arrive as `action` children — separate client islands — so the
 * card itself stays static.
 *
 * Design decisions worth keeping:
 *
 *  - ONE badge, never a stack. Two or three competing flags on a tile is how a
 *    grid starts to look like a discount bin, and none of them get read.
 *  - The price line carries the discount, so the image does not have to.
 *  - Fixed 3:4 image well, so the grid reserves its final height before any
 *    image loads and CLS stays at zero.
 *  - `sizes` is declared per breakpoint, so a phone downloads a phone-sized
 *    image rather than the 900px one.
 */

/** Ranked by how much each actually influences a decision. */
const BADGE_PRIORITY: ProductBadgeKind[] = [
  'LOW_STOCK',
  'BESTSELLER',
  'NEW',
  'TRENDING',
  'BACK_IN_STOCK',
  'PREMIUM',
  'DEAL',
  'SPONSORED',
];

const BADGE_STYLE: Record<ProductBadgeKind, string> = {
  LOW_STOCK: 'bg-ember-600 text-white',
  BESTSELLER: 'bg-ink text-canvas',
  NEW: 'bg-canvas text-ink',
  TRENDING: 'bg-ink text-canvas',
  BACK_IN_STOCK: 'bg-success-600 text-white',
  PREMIUM: 'bg-brass-500 text-white',
  DEAL: 'bg-ember-600 text-white',
  SPONSORED: 'bg-canvas/85 text-muted',
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

  const badge = BADGE_PRIORITY.map((kind) =>
    product.badges.find((b) => b.kind === kind),
  ).find(Boolean);

  return (
    <article className={cn('group relative flex flex-col', className)}>
      <div className="bg-sunken relative aspect-3/4 overflow-hidden rounded-lg">
        <Link href={`/product/${product.slug}`} tabIndex={-1} aria-hidden className="block h-full">
          <Image
            src={product.primaryImage}
            alt={product.title}
            fill
            priority={priority}
            loading={priority ? undefined : 'lazy'}
            sizes="(max-width: 40rem) 50vw, (max-width: 64rem) 33vw, (max-width: 96rem) 25vw, 300px"
            className={cn(
              'object-cover transition-[opacity,transform] duration-500 ease-out-quint',
              // A gentle push-in on hover reads as depth; the second shot then
              // cross-fades over it, so no request is made on hover.
              'motion-safe:group-hover:scale-[1.03]',
              product.hoverImage ? 'group-hover:opacity-0' : '',
              soldOut ? 'opacity-55 saturate-[0.6]' : '',
            )}
          />
          {product.hoverImage ? (
            <Image
              src={product.hoverImage}
              alt=""
              aria-hidden
              fill
              loading="lazy"
              sizes="(max-width: 40rem) 50vw, (max-width: 64rem) 33vw, (max-width: 96rem) 25vw, 300px"
              className="pointer-events-none object-cover opacity-0 transition-opacity duration-500 group-hover:opacity-100"
            />
          ) : null}
        </Link>

        {badge ? (
          <span
            className={cn(
              'pointer-events-none absolute left-2.5 top-2.5 rounded-full px-2.5 py-1 text-2xs font-medium tracking-wide',
              BADGE_STYLE[badge.kind],
            )}
          >
            {badge.label}
          </span>
        ) : null}

        {soldOut ? (
          <div className="bg-canvas/90 absolute inset-x-0 bottom-0 py-2 text-center backdrop-blur-sm">
            <span className="text-ink text-xs font-medium tracking-wide">Sold out</span>
          </div>
        ) : null}

        {action ? <div className="absolute right-2.5 top-2.5">{action}</div> : null}
      </div>

      <div className="flex flex-1 flex-col gap-1 pt-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-faint truncate text-2xs font-medium uppercase tracking-[0.12em]">
            {product.brandName}
          </p>
          <RatingStars rating={product.rating} count={product.ratingCount} />
        </div>

        {/*
          The whole card is clickable via this stretched link, which keeps the
          accessible name on the product title rather than on a bare wrapper.
        */}
        <h3 className="text-ink clamp-2 text-sm leading-snug">
          <Link href={`/product/${product.slug}`} className="after:absolute after:inset-0">
            {product.title}
          </Link>
        </h3>

        <div className="tabular mt-0.5 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-ink text-md font-semibold">
            {formatMoney(product.sellingPrice)}
          </span>
          {product.discountPercent > 0 ? (
            <>
              <span className="text-faint text-xs line-through">{formatMoney(product.mrp)}</span>
              <span className="text-ember-600 text-xs font-medium">
                {product.discountPercent}% off
              </span>
            </>
          ) : null}
        </div>

        {product.colorOptions.length > 1 ? (
          <div className="mt-1.5 flex items-center gap-1">
            {product.colorOptions.slice(0, 4).map((color) => (
              <span
                key={color.value}
                title={color.label}
                className="border-line-strong size-3 rounded-full border"
                style={{ backgroundColor: color.hex }}
              />
            ))}
            {product.colorOptions.length > 4 ? (
              <span className="text-faint ml-0.5 text-2xs">
                +{product.colorOptions.length - 4}
              </span>
            ) : null}
          </div>
        ) : null}
      </div>
    </article>
  );
}
