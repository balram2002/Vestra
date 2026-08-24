import { AlertTriangle, ShoppingBag, Truck } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { CartLineItem } from '@/components/commerce/cart-line-item';
import { Button } from '@/components/ui/button';
import { formatMoney } from '@/lib/format';
import { currentOwner } from '@/server/auth/session';
import { getCartView } from '@/server/services/cart';

/**
 * The bag.
 *
 * Never indexed and never cached — it is per-visitor by definition. The page
 * shell renders immediately and the bag itself streams behind `<Suspense>`,
 * because reading the session is what makes it dynamic.
 */
export const metadata: Metadata = {
  title: 'Your bag',
  robots: { index: false, follow: false },
};

export default function BagPage() {
  return (
    <div className="gutter shell-max py-6">
      <h1 className="font-display text-ink text-2xl">Your bag</h1>

      <Suspense fallback={<BagSkeleton />}>
        <BagContents />
      </Suspense>
    </div>
  );
}

async function BagContents() {
  const owner = await currentOwner();
  const cart = await getCartView(owner);

  if (cart.groups.length === 0) {
    return <EmptyBag />;
  }

  const blockingCount = cart.issues.filter((issue) => issue.blocking).length;

  // The price engine reports each discount source separately so refunds and
  // settlements can be derived exactly. The bag only needs two lines, so the
  // catalogue-side reductions are summed here rather than in the engine.
  const catalogueDiscount =
    cart.pricing.listDiscount + cart.pricing.sellerDiscount + cart.pricing.platformDiscount;
  const deliveryFee = cart.pricing.shippingFee - cart.pricing.shippingDiscount;

  return (
    <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <div>
        {blockingCount > 0 ? (
          <div
            role="alert"
            className="border-danger-100 bg-danger-50 text-danger-700 mb-5 flex items-start gap-2 rounded-md border p-3 text-sm"
          >
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            <p>
              {blockingCount === 1
                ? 'One item needs attention before you can check out.'
                : `${blockingCount} items need attention before you can check out.`}{' '}
              They are marked below.
            </p>
          </div>
        ) : null}

        {/*
          Grouped by seller, because that is how the order will split: each
          group becomes its own seller order, shipment and settlement. Telling
          the shopper up front avoids the "why are there three parcels?" ticket.
        */}
        {cart.groups.map((group) => (
          <section key={group.sellerId} className="border-line mb-5 rounded-lg border">
            <header className="border-line flex flex-wrap items-center justify-between gap-2 border-b px-4 py-3">
              <p className="text-sm">
                <span className="text-faint">Sold by </span>
                <Link
                  href={`/store/${group.sellerSlug}`}
                  className="text-ink font-medium hover:underline"
                >
                  {group.sellerName}
                </Link>
              </p>

              <p className="text-faint text-xs">
                {group.shippingFee === 0 ? (
                  <span className="text-success-600 inline-flex items-center gap-1">
                    <Truck className="size-3.5" aria-hidden />
                    Free delivery
                  </span>
                ) : (
                  <>Delivery {formatMoney(group.shippingFee)}</>
                )}
              </p>
            </header>

            {/* A nudge only when it is true and actionable. */}
            {group.amountToFreeShipping && group.amountToFreeShipping > 0 ? (
              <p className="border-line bg-sunken text-muted border-b px-4 py-2 text-xs">
                Add {formatMoney(group.amountToFreeShipping)} more from this seller for free
                delivery.
              </p>
            ) : null}

            <ul className="px-4">
              {group.lines.map((line) => (
                <CartLineItem key={line.item.id} line={line} />
              ))}
            </ul>
          </section>
        ))}
      </div>

      {/* --------------------------------------------------------- summary */}

      <aside className="lg:sticky lg:top-28 lg:self-start">
        <div className="border-line rounded-lg border p-5">
          <h2 className="text-ink text-sm font-semibold uppercase tracking-wider">
            Price details
          </h2>

          <dl className="mt-4 space-y-2.5 text-sm">
            <Row
              label={`Bag total (${cart.totalUnits} ${cart.totalUnits === 1 ? 'item' : 'items'})`}
              value={formatMoney(cart.pricing.mrpTotal)}
            />

            {catalogueDiscount > 0 ? (
              <Row
                label="Discount"
                value={`− ${formatMoney(catalogueDiscount)}`}
                tone="success"
              />
            ) : null}

            {cart.pricing.couponDiscount > 0 ? (
              <Row
                label={cart.pricing.couponCode ? `Coupon ${cart.pricing.couponCode}` : 'Coupon'}
                value={`− ${formatMoney(cart.pricing.couponDiscount)}`}
                tone="success"
              />
            ) : null}

            <Row
              label="Delivery"
              value={deliveryFee === 0 ? 'Free' : formatMoney(deliveryFee)}
              tone={deliveryFee === 0 ? 'success' : undefined}
            />

            {cart.pricing.giftWrapFee > 0 ? (
              <Row label="Gift wrap" value={formatMoney(cart.pricing.giftWrapFee)} />
            ) : null}

            <div className="border-line mt-3 border-t pt-3">
              <Row label="Total payable" value={formatMoney(cart.pricing.payable)} emphasis />
              <p className="text-faint mt-1 text-2xs">Inclusive of all taxes</p>
            </div>
          </dl>

          <Button
            asChild={cart.checkoutReady}
            size="cta"
            className="mt-5"
            disabled={!cart.checkoutReady}
          >
            {cart.checkoutReady ? (
              <Link href="/checkout">Proceed to checkout</Link>
            ) : (
              <span>Resolve items to continue</span>
            )}
          </Button>

          {cart.pricing.totalSavings > 0 ? (
            <p className="text-success-600 mt-3 text-center text-xs font-medium">
              You save {formatMoney(cart.pricing.totalSavings)} ({cart.pricing.savingsPercent}%) on
              this order
            </p>
          ) : null}
        </div>
      </aside>
    </div>
  );
}

function Row({
  label,
  value,
  tone,
  emphasis,
}: {
  label: string;
  value: string;
  tone?: 'success';
  emphasis?: boolean;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className={emphasis ? 'text-ink font-semibold' : 'text-muted'}>{label}</dt>
      <dd
        className={[
          'tabular',
          emphasis ? 'text-ink text-md font-semibold' : '',
          tone === 'success' ? 'text-success-600' : 'text-ink',
        ].join(' ')}
      >
        {value}
      </dd>
    </div>
  );
}

function EmptyBag() {
  return (
    <div className="border-line mt-8 flex flex-col items-center rounded-lg border border-dashed px-6 py-20 text-center">
      <ShoppingBag className="text-faint size-9" aria-hidden />
      <h2 className="text-ink mt-4 text-lg font-semibold">Your bag is empty</h2>
      <p className="text-muted mt-1.5 max-w-sm text-sm">
        Nothing here yet. Anything you add stays in your bag for 30 days, even if you close the
        tab.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link href="/category/women">Shop women</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/category/men">Shop men</Link>
        </Button>
      </div>
    </div>
  );
}

function BagSkeleton() {
  return (
    <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]" aria-hidden>
      <div className="space-y-4">
        {Array.from({ length: 2 }, (_, i) => (
          <div key={i} className="border-line rounded-lg border p-4">
            <div className="skeleton h-4 w-40 rounded-xs" />
            <div className="mt-4 flex gap-3">
              <div className="skeleton aspect-[3/4] w-24 rounded-md" />
              <div className="flex-1 space-y-2">
                <div className="skeleton h-4 w-3/4 rounded-xs" />
                <div className="skeleton h-3 w-1/3 rounded-xs" />
                <div className="skeleton h-4 w-24 rounded-xs" />
              </div>
            </div>
          </div>
        ))}
      </div>
      <div className="skeleton h-72 rounded-lg" />
    </div>
  );
}
