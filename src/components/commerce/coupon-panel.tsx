'use client';

import { Tag, X } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import type { AppliedCoupon, CouponOffer } from '@/domain/types';
import { formatMoney } from '@/lib/format';
import { applyCoupon, removeCoupon } from '@/server/actions/cart';

/**
 * Coupons on the bag.
 *
 * Two halves, because shoppers arrive in two states. Someone who was given a
 * code wants to type it; everyone else wants to be told what they qualify for.
 * Showing only the input hides the offers, and showing only the list makes a
 * shopper with a code hunt for the field.
 *
 * The list is ordered by what it would actually save, and unusable coupons are
 * kept — with the shortfall — because "add ₹300 more to save ₹500" converts,
 * while a hidden coupon does nothing.
 */
export function CouponPanel({
  applied,
  offers,
}: {
  applied: AppliedCoupon | null;
  offers: CouponOffer[];
}) {
  const [code, setCode] = useState('');
  const [expanded, setExpanded] = useState(false);
  const [pending, startTransition] = useTransition();

  const usable = offers.filter((offer) => offer.applicable && offer.code !== applied?.code);
  const nearMiss = offers.filter((offer) => !offer.applicable && offer.amountToUnlock !== null);
  const visible = expanded ? [...usable, ...nearMiss] : [...usable, ...nearMiss].slice(0, 3);

  const submit = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) {
      toast.error('Enter a coupon code');
      return;
    }

    startTransition(async () => {
      const result = await applyCoupon({ code: trimmed });
      if (result.ok) {
        toast.success('Coupon applied');
        setCode('');
      } else {
        toast.error(result.error ?? 'That coupon did not apply.');
      }
    });
  };

  return (
    <section className="border-line rounded-lg border p-4">
      <h2 className="text-ink flex items-center gap-1.5 text-sm font-medium">
        <Tag className="text-muted size-3.5" aria-hidden />
        Offers and coupons
      </h2>

      {applied ? (
        <div className="border-success-100 bg-success-50 mt-3 flex items-start justify-between gap-3 rounded-md border p-3">
          <div className="min-w-0">
            <p className="text-success-700 text-sm font-semibold">{applied.code} applied</p>
            <p className="text-success-700/80 mt-0.5 text-xs">
              {applied.title} · saving {formatMoney(applied.discount)}
            </p>
          </div>
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await removeCoupon();
                if (result.ok) toast.success('Coupon removed');
                else toast.error(result.error ?? 'That did not work.');
              })
            }
            aria-label={`Remove coupon ${applied.code}`}
            className="text-success-700/70 hover:text-danger-600 shrink-0 transition-colors"
          >
            <X className="size-4" />
          </button>
        </div>
      ) : (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            submit(code);
          }}
          className="mt-3 flex gap-2"
        >
          <label className="min-w-0 flex-1">
            <span className="sr-only">Coupon code</span>
            <input
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="Enter code"
              autoComplete="off"
              spellCheck={false}
              className="border-line-strong bg-canvas text-ink placeholder:text-faint h-9 w-full rounded-sm border px-2.5 font-mono text-sm uppercase"
            />
          </label>
          <button
            type="submit"
            disabled={pending || code.trim().length < 3}
            className="bg-ink text-canvas disabled:bg-line-strong shrink-0 rounded-sm px-3 text-xs font-medium disabled:cursor-not-allowed"
          >
            {pending ? 'Checking…' : 'Apply'}
          </button>
        </form>
      )}

      {visible.length > 0 ? (
        <ul className="mt-3 space-y-2">
          {visible.map((offer) => (
            <li
              key={offer.code}
              className="border-line flex items-start justify-between gap-3 rounded-md border p-2.5"
            >
              <div className="min-w-0">
                <p className="text-ink font-mono text-xs font-semibold">{offer.code}</p>
                <p className="text-muted mt-0.5 text-xs">{offer.description}</p>
                {!offer.applicable && offer.reason ? (
                  <p className="text-faint mt-0.5 text-2xs">{offer.reason}</p>
                ) : null}
              </div>

              {offer.applicable ? (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => submit(offer.code)}
                  className="text-accent shrink-0 text-xs font-medium hover:underline disabled:opacity-50"
                >
                  Save {formatMoney(offer.potentialDiscount)}
                </button>
              ) : (
                <span className="text-faint shrink-0 text-2xs">Not yet</span>
              )}
            </li>
          ))}
        </ul>
      ) : null}

      {usable.length + nearMiss.length > 3 ? (
        <button
          type="button"
          onClick={() => setExpanded((open) => !open)}
          className="text-muted hover:text-ink mt-2 text-xs underline-offset-2 hover:underline"
        >
          {expanded ? 'Show fewer' : `Show all ${usable.length + nearMiss.length} offers`}
        </button>
      ) : null}
    </section>
  );
}
