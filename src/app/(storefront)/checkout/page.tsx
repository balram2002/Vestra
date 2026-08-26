import { MapPin, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { CheckoutForm } from '@/components/checkout/checkout-form';
import { CheckoutSteps } from '@/components/checkout/checkout-steps';
import { Button } from '@/components/ui/button';
import { SHIPPING } from '@/config/business';
import { formatMoney } from '@/lib/format';
import { currentOwner, getSessionUser } from '@/server/auth/session';
import { collections, toEntities } from '@/server/db/collections';
import { getCartView } from '@/server/services/cart';

export const metadata: Metadata = {
  title: 'Checkout',
  robots: { index: false, follow: false },
};

/**
 * Checkout.
 *
 * The bag is re-derived here rather than trusted from the previous page, so an
 * item that sold out during the walk from bag to checkout is caught before any
 * payment is opened — and the shopper is sent back to fix it rather than being
 * charged for something that no longer exists.
 */
export default function CheckoutPage() {
  return (
    <div className="gutter shell-max py-6">
      <h1 className="font-display text-ink text-2xl">Checkout</h1>

      <Suspense fallback={<CheckoutSkeleton />}>
        <CheckoutFlow />
      </Suspense>
    </div>
  );
}

async function CheckoutFlow() {
  /*
   * No `requireUser` here. A guest can buy — being made to create an account
   * in order to hand over money is the single largest avoidable drop-off in a
   * checkout, and everything downstream already treats `order.userId` as
   * nullable.
   */
  const [user, owner] = await Promise.all([getSessionUser(), currentOwner()]);
  const cart = await getCartView(owner);

  if (cart.groups.length === 0 || !cart.checkoutReady) {
    redirect('/bag');
  }

  const addressCol = await collections.addresses();
  const addresses = user
    ? toEntities(await addressCol.find({ userId: user.id }).sort({ isDefault: -1 }).toArray())
    : [];

  // COD is offered only when every seller in the bag supports it and the total
  // is inside the platform cap — one seller opting out disables it for the
  // whole order, because the order ships as several parcels.
  const sellers = await collections.sellers();
  const sellerDocs = toEntities(
    await sellers.find({ _id: { $in: cart.groups.map((g) => g.sellerId) } }).toArray(),
  );
  const codAvailable =
    sellerDocs.length > 0 &&
    sellerDocs.every((s) => s.policies.codEnabled) &&
    cart.pricing.payable <= SHIPPING.maxCodOrderValue;

  return (
    <>
      <CheckoutSteps current={1} />

      <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-14">
        <div>
          {/*
            The "add an address first" detour applies only to a SIGNED-IN
            shopper with an empty address book — they have somewhere to save it
            to. A guest has no address book by definition, and sending them to
            /account/addresses would bounce them into a sign-in wall from the
            middle of a checkout.
          */}
          {user && addresses.length === 0 ? (
            <div className="border-line rounded-lg border border-dashed p-8 text-center">
              <MapPin className="text-faint mx-auto size-7" aria-hidden />
              <p className="text-ink mt-3 text-md font-medium">No saved addresses</p>
              <p className="text-muted mt-1 text-sm">
                Add where you would like this delivered before you pay.
              </p>
              <Button asChild variant="secondary" size="sm" className="mt-5">
                <Link href="/account/addresses">
                  <Plus className="size-4" />
                  Add an address
                </Link>
              </Button>
            </div>
          ) : (
            <CheckoutForm
              isGuest={!user}
              addresses={addresses}
              payable={cart.pricing.payable}
              codAvailable={codAvailable}
            />
          )}
        </div>

        <aside className="lg:sticky lg:top-28 lg:self-start">
          <div className="border-line rounded-lg border p-5">
            <h2 className="text-faint text-2xs font-medium uppercase tracking-[0.14em]">
              Order summary
            </h2>

            <p className="text-muted mt-3 text-sm">
              {cart.totalUnits} {cart.totalUnits === 1 ? 'item' : 'items'} from{' '}
              {cart.groups.length} {cart.groups.length === 1 ? 'seller' : 'sellers'}
            </p>

            <dl className="mt-4 space-y-2.5 text-sm">
              <Row label="Items" value={formatMoney(cart.pricing.subtotal)} />
              {cart.pricing.couponDiscount > 0 ? (
                <Row
                  label="Coupon"
                  value={`− ${formatMoney(cart.pricing.couponDiscount)}`}
                  tone="success"
                />
              ) : null}
              <Row
                label="Delivery"
                value={
                  cart.pricing.shippingFee - cart.pricing.shippingDiscount === 0
                    ? 'Free'
                    : formatMoney(cart.pricing.shippingFee - cart.pricing.shippingDiscount)
                }
              />
              <div className="border-line border-t pt-3">
                <Row label="Total payable" value={formatMoney(cart.pricing.payable)} emphasis />
                <p className="text-faint mt-1 text-2xs">Inclusive of all taxes</p>
              </div>
            </dl>

            <ul className="border-line text-faint mt-5 space-y-1.5 border-t pt-4 text-2xs">
              {cart.groups.map((group) => (
                <li key={group.sellerId} className="flex justify-between gap-3">
                  <span className="truncate">{group.sellerName}</span>
                  <span className="tabular shrink-0">{formatMoney(group.subtotal)}</span>
                </li>
              ))}
            </ul>
          </div>
        </aside>
      </div>
    </>
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
          emphasis ? 'text-ink text-md font-semibold' : 'text-ink',
          tone === 'success' ? 'text-success-600' : '',
        ].join(' ')}
      >
        {value}
      </dd>
    </div>
  );
}

function CheckoutSkeleton() {
  return (
    <div className="mt-8 grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem]" aria-hidden>
      <div className="space-y-3">
        <div className="skeleton h-4 w-40 rounded-xs" />
        <div className="skeleton h-28 w-full rounded-lg" />
        <div className="skeleton h-28 w-full rounded-lg" />
      </div>
      <div className="skeleton h-72 rounded-lg" />
    </div>
  );
}
