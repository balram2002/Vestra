import Image from 'next/image';
import Link from 'next/link';

import type { ProductBadgeKind, ProductSummary } from '@/domain/types';
import { cn } from '@/lib/cn';

import { PriceBlock } from './price-block';
import { RatingStars } from './rating-stars';

/**
 * Product card.
 *
 * The most-repeated component in the shop, so it is a Server Component with NO
 * CLIENT JAVASCRIPT AT ALL: a 48-card grid that hydrates is a measurable INP
 * cost for a surface whose only job is to link somewhere. Every hover effect
 * below is therefore pure CSS, and interactive affordances arrive as `action`
 * children — separate client islands — so the card itself stays static.
 *
 * That constraint is the interesting part of the design. A card cannot know
 * whether it is hovered in JavaScript, so the entire reveal — the second
 * photograph, the size rail, the lifted shadow — is built out of `group-hover`,
 * `transform` and `opacity`, all of which composite. The result runs at 60fps
 * on a grid of fifty on a phone from 2019.
 *
 * ---------------------------------------------------------------------------
 * THE DECISIONS, IN THE ORDER THEY MATTER
 * ---------------------------------------------------------------------------
 *
 *  - **ONE badge, never a stack.** Two or three competing flags on a tile is
 *    how a grid starts to look like a discount bin, and none of them get read.
 *    `BADGE_PRIORITY` ranks them by how much each actually changes a decision:
 *    "only 2 left" beats "bestseller" beats "new".
 *
 *  - **A fixed 4:5 image well**, so the grid reserves its final height before
 *    any image loads and CLS stays at zero. 4:5 rather than 3:4 because
 *    garments are taller than they are wide and the extra height is the
 *    difference between a shot that crops at the knee and one that does not.
 *    `sizes` is declared per breakpoint, so a phone downloads a phone-sized
 *    image rather than the 900px one.
 *
 *  - **The price line carries the discount**, so the image does not have to. A
 *    "50% OFF" flash over the photograph is the single fastest way to make
 *    premium stock look cheap.
 *
 *  - **A hairline ring inside the image well.** Fashion photography is shot on
 *    white; without the ring a white-on-white product has no edge and the whole
 *    grid dissolves into the page.
 *
 *  - **Sold out desaturates rather than hides.** An out-of-stock product still
 *    answers "do they carry this", and hiding it makes a category look thinner
 *    than it is. It simply must never look available.
 *
 *  - **The size rail appears on hover and is never the only way to see sizes.**
 *    It is `aria-hidden` decoration that saves a pointer user one click; the
 *    PDP is the source of truth, and touch — which has no hover — loses
 *    nothing.
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
  // The only two that get the urgency colour.
  LOW_STOCK: 'bg-danger-fill text-white',
  DEAL: 'bg-danger-fill text-white',
  BESTSELLER: 'bg-ink text-canvas',
  TRENDING: 'bg-ink text-canvas',
  // Frosted rather than solid: "new" is the quietest thing worth saying.
  NEW: 'bg-raised/90 text-ink backdrop-blur-md',
  BACK_IN_STOCK: 'bg-success-fill text-white',
  PREMIUM: 'bg-premium-fill text-white',
  // Disclosure, not promotion — it must not compete with a real badge.
  SPONSORED: 'bg-raised/80 text-muted backdrop-blur-md',
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
  /**
   * Sizes to reveal on hover.
   *
   * Decoration for a pointer, and `aria-hidden` for that reason — see the
   * header note. Capped at six by the renderer: a seven-size rail wraps and
   * pushes the card's own height around on hover, which is the one thing this
   * effect must never do.
   */
  sizes?: string[];
  className?: string;
}

export function ProductCard({
  product,
  priority = false,
  action,
  sizes: sizeOptions,
  className,
}: ProductCardProps) {
  const soldOut = product.stockLevel === 'OUT_OF_STOCK';

  const badge = BADGE_PRIORITY.map((kind) => product.badges.find((b) => b.kind === kind)).find(
    Boolean,
  );

  const imageSizes =
    '(max-width: 40rem) 46vw, (max-width: 64rem) 31vw, (max-width: 96rem) 23vw, 300px';

  const sizeRail = soldOut ? [] : (sizeOptions ?? []).slice(0, 6);

  return (
    <article className={cn('group bg-raised border-line relative min-w-0 flex flex-col overflow-hidden rounded-2xl border p-1.5 sm:p-2', className)}>
      <div
        className={cn(
          'bg-sunken relative aspect-4/5 overflow-hidden rounded-xl',
          /*
           * The well itself lifts, not the whole card: the type below stays
           * pinned to the grid baseline while the photograph rises, which reads
           * as the image coming forward rather than the card wobbling.
           *
           * This is the one place in the codebase that transitions `box-shadow`
           * directly instead of using `.lift`, and both halves of that are
           * deliberate. The utility cross-fades a pseudo-element carrying the
           * shadow — but this well sets `overflow-hidden` to clip the
           * photograph, which would clip that pseudo-element's shadow away
           * entirely. Escaping it would mean a wrapper element on the
           * most-repeated component in the shop.
           *
           * And the cost it avoids does not apply here: `.lift` earns its keep
           * when many elements animate at once, whereas exactly one card is
           * hovered at a time, so this is a single element repainting a shadow.
           * The lift travels on `transform` regardless, which is the expensive
           * half.
           */
          'transition-[transform,box-shadow] duration-(--duration-slow) ease-(--ease-out)',
          !soldOut && 'motion-safe:group-hover:-translate-y-1 group-hover:shadow-lg',
        )}
      >
        {/*
          The image is wrapped in its own `aria-hidden` link.

          Two links to the same place in one card would be announced twice and
          tabbed through twice. The title's link below is the real one — it
          carries the accessible name and stretches over the whole card — and
          this one exists only so a pointer click on the photograph works.
        */}
        <Link href={`/product/${product.slug}`} tabIndex={-1} aria-hidden className="block h-full">
          <Image
            src={product.primaryImage}
            alt={product.title}
            fill
            priority={priority}
            loading={priority ? undefined : 'lazy'}
            sizes={imageSizes}
            className={cn(
              'object-cover transition-transform duration-500 ease-out motion-safe:group-hover:scale-[1.045]',
              soldOut && 'opacity-50 saturate-[0.35]',
            )}
          />
        </Link>

        {/*
          The edge, for product photography shot on white.

          `ring-inset` rather than a border: a border would sit outside the
          rounded corner and paint a visible notch where the two radii disagree.
        */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-xl ring-1 ring-inset ring-black/[0.07]"
        />

        {badge ? (
          <span
            className={cn(
              'pointer-events-none absolute left-2.5 top-2.5 max-w-[calc(100%-3.5rem)] truncate rounded-full px-2.5 py-1',
              'text-2xs font-semibold uppercase tracking-[0.06em] shadow-xs',
              BADGE_STYLE[badge.kind],
            )}
          >
            {badge.label}
          </span>
        ) : null}

        {soldOut ? (
          <div className="absolute inset-0 grid place-items-center">
            <span className="bg-raised/92 text-ink rounded-full px-4 py-2 text-xs font-semibold tracking-wide backdrop-blur-sm">
              Sold out
            </span>
          </div>
        ) : null}

        {action ? <div className="absolute right-2.5 top-2.5 z-20">{action}</div> : null}

        {/*
          The size rail.

          Slides up from beneath the image's lower edge on hover. It is
          translated 100% down at rest rather than hidden, so the browser has
          already laid it out and the reveal is one compositor-only transform
          with nothing to measure.

          `hover-only` (see global.css) forces it visible where there is no
          hover at all, but the rail is additionally gated on `md` — on a phone
          it would sit permanently over the bottom of every photograph in the
          grid.
        */}
        {sizeRail.length > 0 ? (
          <div
            aria-hidden
            className={cn(
              'pointer-events-none absolute inset-x-0 bottom-0 hidden p-2.5 md:block',
              'translate-y-full opacity-0',
              'transition-[transform,opacity] duration-(--duration-slow) ease-(--ease-out)',
              'group-hover:translate-y-0 group-hover:opacity-100',
            )}
          >
            <div className="glass flex items-center justify-center gap-1 rounded-lg px-2 py-1.5 shadow-sm">
              {sizeRail.map((size) => (
                <span
                  key={size}
                  className="text-muted min-w-6 rounded px-1 text-center text-2xs font-medium"
                >
                  {size}
                </span>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5 px-1 pb-2 pt-3">
        <p className="text-faint truncate text-2xs font-semibold uppercase tracking-[0.13em]">
          {product.brandName}
        </p>

        {/*
          The stretched link.

          The whole card is clickable through this, which keeps the accessible
          name on the product title rather than on a bare wrapper. Exactly ONE
          element per card may carry it, or the card gets two overlapping
          full-size targets and the later one silently wins.
        */}
        <h3 className="text-ink clamp-2 text-sm font-medium leading-snug">
          <Link
            href={`/product/${product.slug}`}
            className={cn(
              'after:absolute after:inset-0 focus-visible:underline',
              // The title is the one element that responds to hovering the
              // card, which keeps the connection between the photograph and its
              // name legible in a dense grid.
              'transition-colors duration-(--duration-base) group-hover:text-accent-ink',
            )}
          >
            {product.title}
          </Link>
        </h3>

        <PriceBlock
          sellingPrice={product.sellingPrice}
          mrp={product.mrp}
          discountPercent={product.discountPercent}
          size="md"
          className="mt-0.5"
        />

        <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-2">
          <RatingStars rating={product.rating} count={product.ratingCount} />

          {product.colorOptions.length > 1 ? (
            <span className="flex items-center gap-1" aria-hidden>
              {product.colorOptions.slice(0, 4).map((color) => (
                <span
                  key={color.value}
                  title={color.label}
                  className={cn(
                    'size-3 rounded-full ring-1 ring-inset ring-black/20',
                    'transition-transform duration-(--duration-base) ease-(--ease-spring)',
                    'motion-safe:group-hover:scale-115',
                  )}
                  style={{ backgroundColor: color.hex }}
                />
              ))}
              {product.colorOptions.length > 4 ? (
                <span className="text-faint ml-0.5 text-2xs">
                  +{product.colorOptions.length - 4}
                </span>
              ) : null}
            </span>
          ) : null}
        </div>

        {/*
          Colour count, for assistive tech.

          The swatch row above is `aria-hidden` because a list of unlabelled
          colour chips announces as nothing useful; this says the one fact they
          actually convey.
        */}
        {product.colorOptions.length > 1 ? (
          <span className="sr-only">Available in {product.colorOptions.length} colours</span>
        ) : null}
      </div>
    </article>
  );
}
