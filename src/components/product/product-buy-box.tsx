'use client';

import { Check, ShoppingBag } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { PriceBlock } from '@/components/commerce/price-block';
import { Button } from '@/components/ui/button';
import { INVENTORY } from '@/config/business';
import type { ProductVariant } from '@/domain/types';
import { cn } from '@/lib/cn';
import { addToBag } from '@/server/actions/cart';

/**
 * Buy box: colour, size, price and add-to-bag.
 *
 * A client island because the price and stock line must respond to the selected
 * variant without a round trip — a shopper comparing sizes should not wait on
 * the network to learn which ones are in stock.
 *
 * Deliberate behaviours:
 *
 *  - NO SIZE IS PRESELECTED. Auto-selecting one is how people order the wrong
 *    size, and size is the single largest driver of fashion returns.
 *  - Sold-out sizes are shown, struck through, and remain focusable, so the
 *    shopper learns their size exists but is unavailable rather than wondering
 *    whether the seller stocks it at all.
 *  - The add-to-bag call runs inside `useTransition`, so the button shows a
 *    pending state in the same tick as the click.
 */
export function ProductBuyBox({
  productId,
  variants,
  sizeOptions,
  colorOptions,
}: {
  productId: string;
  variants: ProductVariant[];
  sizeOptions: string[];
  colorOptions: Array<{ value: string; label: string; hex: string }>;
}) {
  const [color, setColor] = useState(colorOptions[0]?.value ?? '');
  const [size, setSize] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  const forColor = useMemo(
    () => variants.filter((v) => v.color === color && v.isActive),
    [variants, color],
  );

  const bySize = useMemo(
    () => new Map(forColor.map((v) => [v.size, v])),
    [forColor],
  );

  const selected = size ? (bySize.get(size) ?? null) : null;

  // The quoted price is the selected variant's, or the cheapest available one
  // before a choice is made — never an average, which matches nothing on sale.
  const quoted =
    selected ??
    forColor
      .filter((v) => v.inventory.available > 0)
      .sort((a, b) => a.sellingPrice - b.sellingPrice)[0] ??
    forColor[0];

  const discountPercent =
    quoted && quoted.mrp > quoted.sellingPrice
      ? Math.round(((quoted.mrp - quoted.sellingPrice) / quoted.mrp) * 100)
      : 0;

  const handleAdd = () => {
    if (!selected) {
      // Not a toast-and-forget: the size list is what needs attention.
      toast.error('Choose a size first');
      document.getElementById('size-options')?.scrollIntoView({ block: 'center' });
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
    <div className="space-y-5">
      {quoted ? (
        <div>
          <PriceBlock
            sellingPrice={quoted.sellingPrice}
            mrp={quoted.mrp}
            discountPercent={discountPercent}
            size="lg"
          />
          <p className="text-faint mt-1 text-xs">Inclusive of all taxes</p>
        </div>
      ) : null}

      {colorOptions.length > 1 ? (
        <fieldset>
          <legend className="text-ink text-xs font-semibold uppercase tracking-wider">
            Colour: <span className="text-muted font-normal normal-case">{
              colorOptions.find((c) => c.value === color)?.label
            }</span>
          </legend>

          <div className="mt-2.5 flex flex-wrap gap-2">
            {colorOptions.map((option) => {
              const active = option.value === color;
              return (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => {
                    setColor(option.value);
                    // The new colour may not stock the chosen size, so the
                    // selection is cleared rather than silently kept invalid.
                    setSize(null);
                  }}
                  aria-pressed={active}
                  aria-label={option.label}
                  title={option.label}
                  className={cn(
                    'flex size-8 items-center justify-center rounded-full border transition-[box-shadow,border-color]',
                    active ? 'border-accent ring-accent ring-2 ring-offset-2' : 'border-line-strong',
                  )}
                  style={{ backgroundColor: option.hex }}
                >
                  {active ? <Check className="size-4 text-white mix-blend-difference" /> : null}
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : null}

      <fieldset id="size-options">
        <div className="flex items-center justify-between">
          <legend className="text-ink text-xs font-semibold uppercase tracking-wider">Size</legend>
          <button
            type="button"
            className="text-accent-ink text-xs font-medium underline-offset-4 hover:underline"
            onClick={() => toast.info('Size guide opens here once the chart drawer lands.')}
          >
            Size guide
          </button>
        </div>

        <div className="mt-2.5 flex flex-wrap gap-2">
          {sizeOptions.map((option) => {
            const variant = bySize.get(option);
            const available = variant?.inventory.available ?? 0;
            const soldOut = !variant || available <= 0;
            const active = option === size;

            return (
              <button
                key={option}
                type="button"
                onClick={() => !soldOut && setSize(option)}
                aria-pressed={active}
                aria-disabled={soldOut}
                title={soldOut ? `${option} — sold out` : `${option}`}
                className={cn(
                  'relative flex h-10 min-w-11 items-center justify-center rounded-md border px-3 text-sm transition-colors',
                  active && 'border-accent bg-accent-soft text-accent-ink font-semibold',
                  !active && !soldOut && 'border-line-strong text-ink hover:border-line-bold',
                  soldOut && 'border-line text-faint cursor-not-allowed line-through',
                )}
              >
                {option}
              </button>
            );
          })}
        </div>

        {selected && selected.inventory.available <= INVENTORY.urgencyThreshold ? (
          <p className="text-ember-600 mt-2 text-xs font-medium">
            Only {selected.inventory.available} left in size {selected.size}
          </p>
        ) : null}
      </fieldset>

      <div className="flex gap-2">
        <Button size="cta" onClick={handleAdd} loading={pending}>
          {!pending ? <ShoppingBag className="size-4" /> : null}
          Add to bag
        </Button>
      </div>
    </div>
  );
}
