'use client';

import { AlertTriangle, Heart, Info, Trash2 } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';
import { useTransition } from 'react';
import { toast } from 'sonner';

import { PriceBlock } from '@/components/commerce/price-block';
import type { CartLine } from '@/domain/types';
import { cn } from '@/lib/cn';
import { removeFromBag, saveItemForLater, setBagQuantity } from '@/server/actions/cart';

/**
 * A single bag line.
 *
 * Client-side because quantity, removal and save-for-later are all mutations,
 * each wrapped in `useTransition` so the row shows a pending state immediately
 * rather than after the round trip.
 *
 * Issues are rendered INLINE on the line they belong to, not collected into a
 * banner at the top of the page. A shopper with six items and one sold-out size
 * needs to know which one, and a summary banner makes them hunt for it.
 */
export function CartLineItem({ line }: { line: CartLine }) {
  const [pending, startTransition] = useTransition();

  const blocking = line.issues.filter((issue) => issue.blocking);
  const notices = line.issues.filter((issue) => !issue.blocking);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success?: string) => {
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        if (success) toast.success(success);
      } else {
        toast.error(result.error ?? 'That did not work. Please try again.');
      }
    });
  };

  return (
    <li
      className={cn(
        'border-line flex gap-3 border-t py-4 transition-opacity first:border-t-0',
        pending && 'pointer-events-none opacity-60',
      )}
    >
      <Link
        href={`/product/${line.productSlug}`}
        className="bg-sunken relative aspect-3/4 w-20 shrink-0 overflow-hidden rounded-md sm:w-24"
      >
        <Image
          src={line.image}
          alt={line.productTitle}
          fill
          sizes="96px"
          className="object-cover"
        />
      </Link>

      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link
              href={`/product/${line.productSlug}`}
              className="text-ink clamp-2 text-sm font-medium hover:underline"
            >
              {line.productTitle}
            </Link>

            <p className="text-faint mt-1 text-xs">
              Size {line.size} · {line.colorLabel}
            </p>

            <p className="text-faint mt-0.5 text-2xs">
              Sold by{' '}
              <Link href={`/store/${line.sellerSlug}`} className="hover:text-accent-ink underline-offset-2 hover:underline">
                {line.sellerName}
              </Link>
            </p>
          </div>

          <PriceBlock
            sellingPrice={line.sellingPrice * line.quantity}
            mrp={line.mrp * line.quantity}
            discountPercent={line.discountPercent}
            size="sm"
            className="shrink-0 text-right"
          />
        </div>

        {/* ------------------------------------------------------ issues */}

        {blocking.map((issue) => (
          <p
            key={issue.kind}
            className="text-danger-700 bg-danger-50 border-danger-100 mt-2 flex items-start gap-1.5 rounded-sm border px-2 py-1.5 text-xs"
            role="alert"
          >
            <AlertTriangle className="mt-px size-3.5 shrink-0" aria-hidden />
            <span className="flex-1">
              {issue.message}
              {issue.resolution === 'REDUCE_QUANTITY' && issue.suggestedQuantity ? (
                <button
                  type="button"
                  className="ml-1.5 font-semibold underline underline-offset-2"
                  onClick={() =>
                    run(
                      () =>
                        setBagQuantity({
                          variantId: line.variantId,
                          quantity: issue.suggestedQuantity!,
                        }),
                      `Quantity set to ${issue.suggestedQuantity}`,
                    )
                  }
                >
                  Set to {issue.suggestedQuantity}
                </button>
              ) : null}
              {issue.resolution === 'REMOVE' || issue.resolution === 'MOVE_TO_WISHLIST' ? (
                <button
                  type="button"
                  className="ml-1.5 font-semibold underline underline-offset-2"
                  onClick={() => run(() => removeFromBag(line.variantId), 'Removed from your bag')}
                >
                  Remove
                </button>
              ) : null}
            </span>
          </p>
        ))}

        {notices.map((issue) => (
          <p key={issue.kind} className="text-muted mt-2 flex items-center gap-1.5 text-xs">
            <Info className="size-3.5 shrink-0" aria-hidden />
            {issue.message}
          </p>
        ))}

        {/* ------------------------------------------------------ controls */}

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-1.5">
            <span className="text-faint text-2xs uppercase tracking-wider">Qty</span>
            <select
              value={line.quantity}
              disabled={pending || line.maxQuantity < 1}
              onChange={(event) =>
                run(() =>
                  setBagQuantity({
                    variantId: line.variantId,
                    quantity: Number(event.target.value),
                  }),
                )
              }
              className="border-line-strong bg-raised text-ink h-8 rounded-sm border px-2 text-sm"
              aria-label={`Quantity for ${line.productTitle}`}
            >
              {Array.from({ length: Math.max(1, line.maxQuantity) }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            onClick={() => run(() => saveItemForLater(line.variantId), 'Saved for later')}
            className="text-muted hover:text-accent-ink inline-flex items-center gap-1.5 text-xs transition-colors"
          >
            <Heart className="size-3.5" aria-hidden />
            Save for later
          </button>

          <button
            type="button"
            onClick={() => run(() => removeFromBag(line.variantId), 'Removed from your bag')}
            className="text-muted hover:text-danger-600 inline-flex items-center gap-1.5 text-xs transition-colors"
          >
            <Trash2 className="size-3.5" aria-hidden />
            Remove
          </button>
        </div>
      </div>
    </li>
  );
}
