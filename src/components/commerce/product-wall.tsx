'use client';

import { Plus, ShoppingBag, Star } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { Fragment, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { WishlistButton } from '@/components/commerce/wishlist-button';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import type { ProductSummary } from '@/domain/types';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/format';
import { staggerIndex } from '@/lib/motion';
import { addToBag } from '@/server/actions/cart';
import { loadQuickView } from '@/server/actions/quick-view';
import type { QuickViewData } from '@/server/services/quick-view';

import { tileAfter } from '@/lib/listing-tiles';

/**
 * The Visual wall: a listing read as photographs.
 *
 * Every tile is still a link to the product page -- the wall is a way of
 * browsing, not a dead end -- and the price sits on the picture so the eye
 * never has to leave it. The round button opens a quick view that sells the
 * product in place; it loads on demand, because a page of forty tiles should
 * not carry forty products' worth of sizes for the one someone opens.
 *
 * Order is the listing's order, row by row. A CSS-columns masonry would read
 * down each column instead, which scrambles "price: low to high".
 */
export function ProductWall({
  products,
  savedIds,
  density,
  quickView,
  tiles,
}: {
  products: ProductSummary[];
  savedIds?: string[];
  density: 'airy' | 'dense';
  quickView: boolean;
  tiles?: React.ReactNode[];
}) {
  const [open, setOpen] = useState<QuickViewData | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const saved = new Set(savedIds);
  const dense = density === 'dense';

  const show = async (slug: string) => {
    setLoading(slug);
    try {
      const data = await loadQuickView(slug);
      if (data) setOpen(data);
      else toast.error('This product is no longer available');
    } finally {
      setLoading(null);
    }
  };

  return (
    <>
      <ul
        className={cn(
          'stagger grid grid-flow-row-dense',
          dense ? 'grid-cols-3 gap-0.5 sm:grid-cols-4 lg:grid-cols-6' : 'grid-cols-2 gap-2 sm:grid-cols-3 sm:gap-3 lg:grid-cols-5',
        )}
      >
        {products.map((product, index) => {
          // A feature tile every eleven keeps a long wall from reading as a
          // spreadsheet. Never first -- the opening row should show range,
          // not one product -- never on a phone, where it would fill the
          // screen, and never dense, where it would crowd.
          const feature = !dense && index % 11 === 2;
          const after = tiles?.[tileAfter(index)];
          return (
            <Fragment key={product.id}>
              <li className={cn('min-w-0', feature && 'sm:col-span-2 sm:row-span-2')} style={staggerIndex(index)}>
                <article className={cn('group bg-sunken relative h-full overflow-hidden', dense ? 'rounded-none' : 'rounded-2xl')}>
                  <Link href={`/product/${product.slug}`} className="relative block aspect-3/4 h-full">
                    <Image
                      src={product.primaryImage}
                      alt={product.title}
                      fill
                      priority={index < 4}
                      sizes={feature ? '(min-width: 1024px) 40vw, (min-width: 640px) 66vw, 50vw' : dense ? '(min-width: 1024px) 17vw, 33vw' : '(min-width: 1024px) 25vw, 50vw'}
                      className="object-cover transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none"
                    />
                    <span aria-hidden className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/60 to-transparent" />
                    <span className={cn('absolute inset-x-0 bottom-0 text-white', dense ? 'p-1.5' : 'p-3', quickView && (dense ? 'pr-11' : 'pr-15'))}>
                      {dense ? null : (
                        <span className={cn('line-clamp-1 font-medium drop-shadow', feature ? 'text-xs sm:text-base' : 'text-xs sm:text-sm')}>{product.title}</span>
                      )}
                      <span className="mt-0.5 flex items-baseline gap-1.5">
                        <span className={cn('font-bold drop-shadow', dense ? 'text-xs' : 'text-sm')}>{formatMoney(product.sellingPrice)}</span>
                        {product.discountPercent > 0 && !dense ? (
                          <span className="text-2xs font-semibold text-emerald-300">{product.discountPercent}% off</span>
                        ) : null}
                      </span>
                    </span>
                  </Link>
                  {product.rating >= 4.5 && product.ratingCount > 0 && !dense ? (
                    <span className="text-2xs pointer-events-none absolute left-2 top-2 inline-flex items-center gap-1 rounded-full bg-white/90 px-2 py-0.5 font-semibold text-neutral-900">
                      <Star className="size-3 fill-current" aria-hidden />
                      {product.rating.toFixed(1)}
                    </span>
                  ) : null}
                  {savedIds && !dense ? (
                    <span className="absolute right-2 top-2">
                      <WishlistButton productId={product.id} productTitle={product.title} initialSaved={saved.has(product.id)} size="sm" />
                    </span>
                  ) : null}
                  {quickView ? (
                    <button
                      type="button"
                      onClick={() => show(product.slug)}
                      disabled={loading === product.slug || product.stockLevel === 'OUT_OF_STOCK'}
                      aria-label={product.stockLevel === 'OUT_OF_STOCK' ? `${product.title} is sold out` : `Quick view: ${product.title}`}
                      className={cn(
                        'absolute grid place-items-center rounded-full bg-white text-neutral-900 shadow-md transition-transform hover:scale-105 disabled:opacity-60',
                        dense ? 'bottom-1 right-1 size-9' : 'bottom-2.5 right-2.5 size-11',
                      )}
                    >
                      <Plus className={cn('size-5', loading === product.slug && 'animate-spin')} aria-hidden />
                    </button>
                  ) : null}
                </article>
              </li>
              {after ? <li className={cn('min-w-0', dense && 'col-span-3 sm:col-span-2')}>{after}</li> : null}
            </Fragment>
          );
        })}
      </ul>

      <Dialog
        open={Boolean(open)}
        onOpenChange={(value) => {
          if (!value) setOpen(null);
        }}
      >
        {open ? <QuickViewBody key={open.product.id} data={open} onDone={() => setOpen(null)} /> : null}
      </Dialog>
    </>
  );
}

/**
 * Colour first, then size -- the order people decide in -- with sizes that
 * cannot be bought in the chosen colour struck through rather than hidden, so
 * "is there an M?" is answered, not dodged.
 */
function QuickViewBody({ data, onDone }: { data: QuickViewData; onDone: () => void }) {
  const { product, images, options } = data;
  const colors = [...new Set(options.map((option) => option.color))];
  const firstInStock = options.find((option) => option.available > 0);
  const [color, setColor] = useState(firstInStock?.color ?? colors[0] ?? '');
  const [size, setSize] = useState('');
  const [pending, start] = useTransition();

  const sizes = options.filter((option) => option.color === color);
  const chosen = sizes.find((option) => option.size === size && option.available > 0) ?? null;

  return (
    <DialogContent
      size="lg"
      title={product.title}
      description={`${product.brandName} · sold by ${product.sellerName}`}
      footer={
        <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center">
          <Link href={`/product/${product.slug}`} className="text-accent-ink inline-flex min-h-11 items-center text-sm underline underline-offset-2 sm:mr-auto">
            Full details & size guide
          </Link>
          <Button
            className="sm:min-w-44"
            disabled={!chosen || pending}
            onClick={() =>
              chosen &&
              start(async () => {
                const result = await addToBag({ productId: product.id, variantId: chosen.id, quantity: 1 });
                if (result.ok) {
                  toast.success('Added to your bag');
                  onDone();
                } else toast.error(result.error ?? 'Unable to add this item');
              })
            }
          >
            <ShoppingBag className="size-4" aria-hidden />
            {pending ? 'Adding…' : chosen ? 'Add to bag' : 'Choose a size'}
          </Button>
        </div>
      }
    >
      <div className="grid gap-5 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <div className="no-scrollbar -mx-5 flex snap-x snap-mandatory gap-2 overflow-x-auto px-5 sm:mx-0 sm:px-0">
          {images.map((src, index) => (
            <span key={src} className="bg-sunken relative aspect-3/4 w-[46%] shrink-0 snap-start overflow-hidden rounded-xl sm:w-full">
              <Image src={src} alt={index === 0 ? product.title : ''} fill sizes="(min-width: 640px) 20rem, 46vw" className="object-cover" />
            </span>
          ))}
        </div>

        <div className="min-w-0">
          <p className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-ink text-2xl font-bold">{formatMoney(chosen?.sellingPrice ?? product.sellingPrice)}</span>
            {product.discountPercent > 0 ? (
              <>
                <s className="text-muted text-sm">{formatMoney(product.mrp)}</s>
                <span className="text-success-700 text-sm font-semibold">{product.discountPercent}% off</span>
              </>
            ) : null}
          </p>
          <p className="text-muted mt-1 text-xs">Inclusive of all taxes</p>

          {colors.length > 1 ? (
            <fieldset className="mt-5">
              <legend className="text-ink text-sm font-medium">
                Colour <span className="text-muted font-normal">· {color}</span>
              </legend>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {colors.map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={color === value}
                    onClick={() => {
                      setColor(value);
                      setSize('');
                    }}
                    className={cn(
                      'min-h-10 rounded-full border px-3.5 text-xs font-medium transition-colors',
                      color === value ? 'border-ink bg-ink text-canvas' : 'border-line-control text-ink hover:border-ink',
                    )}
                  >
                    {value}
                  </button>
                ))}
              </div>
            </fieldset>
          ) : null}

          <fieldset className="mt-5">
            <legend className="text-ink text-sm font-medium">Size</legend>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {sizes.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={size === option.size}
                  disabled={option.available < 1}
                  onClick={() => setSize(option.size)}
                  aria-label={option.available < 1 ? `${option.size}, sold out` : option.size}
                  className={cn(
                    'min-h-11 min-w-12 rounded-xl border px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:line-through disabled:opacity-45',
                    size === option.size ? 'border-ink bg-ink text-canvas' : 'border-line-control text-ink hover:border-ink',
                  )}
                >
                  {option.size}
                </button>
              ))}
            </div>
            {chosen && chosen.available <= 3 ? (
              <p className="text-warning-700 mt-2 text-xs font-medium" role="status">
                Only {chosen.available} left in this size
              </p>
            ) : null}
          </fieldset>
        </div>
      </div>
    </DialogContent>
  );
}
