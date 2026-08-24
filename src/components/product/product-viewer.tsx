'use client';

import { Check, Heart, ShoppingBag } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { INVENTORY } from '@/config/business';
import type { Media, ProductVariant } from '@/domain/types';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/format';
import { addToBag } from '@/server/actions/cart';

/**
 * Gallery and buy box, as one client island.
 *
 * They are combined because COLOUR IS SHARED STATE. Split apart, the gallery
 * has no way to know which colourway is selected and ends up showing every
 * shot of every colour at once — sixteen thumbnails for a four-colour style,
 * most of them for a garment the shopper is not looking at.
 *
 * Everything else on the product page stays a Server Component; this is the
 * only interactive region.
 */
export function ProductViewer({
  productId,
  title,
  variants,
  media,
  sizeOptions,
  colorOptions,
  header,
  footer,
}: {
  productId: string;
  title: string;
  variants: ProductVariant[];
  /** Style-level media, used when a colour has none of its own. */
  media: Media[];
  sizeOptions: string[];
  colorOptions: Array<{ value: string; label: string; hex: string }>;
  /**
   * Server-rendered slots for the buy column. Brand, title, rating, seller and
   * policy blocks have no interactive state, so they stay Server Components and
   * are passed through rather than reimplemented on the client.
   */
  header?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  const [color, setColor] = useState(colorOptions[0]?.value ?? '');
  const [size, setSize] = useState<string | null>(null);
  const [shot, setShot] = useState(0);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const forColor = useMemo(
    () => variants.filter((v) => v.color === color && v.isActive),
    [variants, color],
  );

  const bySize = useMemo(() => new Map(forColor.map((v) => [v.size, v])), [forColor]);
  const selected = size ? (bySize.get(size) ?? null) : null;

  /** Only this colourway's shots, de-duplicated — variants share media. */
  const gallery = useMemo(() => {
    const seen = new Set<string>();
    const out: Media[] = [];
    for (const variant of forColor) {
      for (const item of variant.media) {
        if (seen.has(item.url)) continue;
        seen.add(item.url);
        out.push(item);
      }
    }
    return out.length > 0 ? out : media.slice(0, 5);
  }, [forColor, media]);

  const active = gallery[Math.min(shot, gallery.length - 1)] ?? gallery[0];

  // Quote the selected variant, or the cheapest available one before a choice
  // is made — never an average, which matches nothing actually on sale.
  const quoted =
    selected ??
    forColor.filter((v) => v.inventory.available > 0).sort((a, b) => a.sellingPrice - b.sellingPrice)[0] ??
    forColor[0];

  const discountPercent =
    quoted && quoted.mrp > quoted.sellingPrice
      ? Math.round(((quoted.mrp - quoted.sellingPrice) / quoted.mrp) * 100)
      : 0;

  const handleAdd = () => {
    if (!selected) {
      toast.error('Choose a size first');
      document.getElementById('size-options')?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      return;
    }

    startTransition(async () => {
      const result = await addToBag({ productId, variantId: selected.id, quantity: 1 });
      if (result.ok) {
        toast.success('Added to your bag', {
          action: { label: 'View bag', onClick: () => router.push('/bag') },
        });
      } else {
        toast.error(result.error ?? 'Could not add this to your bag.');
      }
    });
  };

  return (
    <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_25rem] lg:gap-14">
      {/* ------------------------------------------------------- gallery */}

      <div className="flex flex-col-reverse gap-3 lg:flex-row lg:gap-4">
        {gallery.length > 1 ? (
          <div
            role="tablist"
            aria-label={`${title} images`}
            className="scrollbar-none flex gap-2 overflow-x-auto lg:w-16 lg:flex-col lg:overflow-visible"
          >
            {gallery.map((item, index) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={index === shot}
                aria-label={item.alt}
                onClick={() => setShot(index)}
                onMouseEnter={() => setShot(index)}
                className={cn(
                  'bg-sunken relative aspect-3/4 w-14 shrink-0 overflow-hidden rounded-md transition-[outline-color] outline outline-2 outline-offset-2 lg:w-full',
                  index === shot ? 'outline-ink' : 'outline-transparent hover:outline-line-bold',
                )}
              >
                <Image src={item.thumbnailUrl} alt="" fill sizes="72px" loading="lazy" className="object-cover" />
              </button>
            ))}
          </div>
        ) : null}

        <div className="bg-sunken relative aspect-3/4 flex-1 overflow-hidden rounded-xl">
          {active ? (
            <Image
              key={active.id}
              src={active.url}
              alt={active.alt}
              fill
              priority={shot === 0}
              sizes="(max-width: 64rem) 100vw, 46vw"
              className="object-cover"
            />
          ) : null}
        </div>
      </div>

      {/* ------------------------------------------------------ buy box */}

      <div className="lg:sticky lg:top-28 lg:self-start">
        {header}

        <div className="space-y-6">
          {quoted ? (
            <div className="tabular flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-ink text-3xl font-semibold">
                {formatMoney(quoted.sellingPrice)}
              </span>
              {discountPercent > 0 ? (
                <>
                  <span className="text-faint text-md line-through">{formatMoney(quoted.mrp)}</span>
                  <span className="text-ember-600 text-md font-medium">{discountPercent}% off</span>
                </>
              ) : null}
              <span className="text-faint w-full text-xs">Inclusive of all taxes</span>
            </div>
          ) : null}

          {colorOptions.length > 1 ? (
            <fieldset>
              <legend className="text-faint text-2xs font-medium uppercase tracking-[0.14em]">
                Colour —{' '}
                <span className="text-ink normal-case tracking-normal">
                  {colorOptions.find((c) => c.value === color)?.label}
                </span>
              </legend>

              <div className="mt-3 flex flex-wrap gap-2.5">
                {colorOptions.map((option) => {
                  const activeColor = option.value === color;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setColor(option.value);
                        // A new colour may not stock the chosen size, and its
                        // gallery is different, so both reset rather than
                        // silently pointing at something that no longer exists.
                        setSize(null);
                        setShot(0);
                      }}
                      aria-pressed={activeColor}
                      aria-label={option.label}
                      title={option.label}
                      className={cn(
                        'relative flex size-9 items-center justify-center rounded-full outline outline-1 outline-offset-2 transition-[outline-color,outline-width]',
                        activeColor ? 'outline-2 outline-ink' : 'outline-line-strong hover:outline-line-bold',
                      )}
                      style={{ backgroundColor: option.hex }}
                    >
                      {activeColor ? (
                        <Check
                          className="size-4"
                          style={{ color: isLight(option.hex) ? '#1a1815' : '#ffffff' }}
                        />
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ) : null}

          <fieldset id="size-options" className="scroll-mt-32">
            <div className="flex items-baseline justify-between">
              <legend className="text-faint text-2xs font-medium uppercase tracking-[0.14em]">
                Size
              </legend>
              <button
                type="button"
                className="text-ink border-b border-current pb-px text-xs font-medium"
                onClick={() => toast.info('The size chart drawer lands with the PDP polish pass.')}
              >
                Size guide
              </button>
            </div>

            <div className="mt-3 flex flex-wrap gap-2">
              {sizeOptions.map((option) => {
                const variant = bySize.get(option);
                const available = variant?.inventory.available ?? 0;
                const soldOut = !variant || available <= 0;
                const activeSize = option === size;

                return (
                  <button
                    key={option}
                    type="button"
                    onClick={() => !soldOut && setSize(option)}
                    aria-pressed={activeSize}
                    aria-disabled={soldOut}
                    title={soldOut ? `${option} — sold out` : option}
                    className={cn(
                      'relative flex h-11 min-w-12 items-center justify-center rounded-md border px-3.5 text-sm transition-colors',
                      activeSize && 'border-ink bg-ink text-canvas font-semibold',
                      !activeSize && !soldOut && 'border-line-strong text-ink hover:border-ink',
                      soldOut && 'border-line text-faint cursor-not-allowed line-through',
                    )}
                  >
                    {option}
                  </button>
                );
              })}
            </div>

            {selected && selected.inventory.available <= INVENTORY.urgencyThreshold ? (
              <p className="text-ember-600 mt-2.5 text-xs font-medium">
                Only {selected.inventory.available} left in size {selected.size}
              </p>
            ) : null}
          </fieldset>

          <div className="flex gap-2.5">
            <Button size="cta" onClick={handleAdd} loading={pending} className="flex-1">
              {!pending ? <ShoppingBag className="size-4" /> : null}
              Add to bag
            </Button>

            <button
              type="button"
              onClick={() => toast.info('Wishlist from the product page lands with the next pass.')}
              aria-label="Save to wishlist"
              className="border-line-strong text-muted hover:border-ink hover:text-ink flex size-12 shrink-0 items-center justify-center rounded-md border transition-colors"
            >
              <Heart className="size-5" />
            </button>
          </div>
        </div>

        {footer}
      </div>
    </div>
  );
}

function isLight(hex: string): boolean {
  const c = hex.replace('#', '');
  const r = Number.parseInt(c.slice(0, 2), 16);
  const g = Number.parseInt(c.slice(2, 4), 16);
  const b = Number.parseInt(c.slice(4, 6), 16);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.6;
}
