import { Check, MapPin, Plus } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

import { Button } from '@/components/ui/button';
import { SHIPPING } from '@/config/business';
import { formatMoney } from '@/lib/format';
import { requireUser } from '@/server/auth/session';
import { collections, toEntities } from '@/server/db/collections';
import { getCartView } from '@/server/services/cart';

export const metadata: Metadata = {
  title: 'Checkout',
  robots: { index: false, follow: false },
};

/**
 * Checkout — delivery step.
 *
 * The funnel is deliberately linear and each step is its own URL, so the back
 * button works, a refresh does not lose progress, and an abandoned checkout can
 * be resumed exactly where it stopped.
 *
 * This step covers the delivery address and the shipping quote. Payment,
 * order placement and confirmation are the next milestone; the stepper shows
 * that plainly rather than presenting a button that would not work.
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
  const user = await requireUser();
  const cart = await getCartView({ kind: 'user', userId: user.id });

  // Reaching checkout with an empty or blocked bag means something changed
  // since the bag page. Send them back rather than showing a broken form.
  if (cart.groups.length === 0 || !cart.checkoutReady) {
    redirect('/bag');
  }

  const addressCol = await collections.addresses();
  const addresses = toEntities(
    await addressCol.find({ userId: user.id }).sort({ isDefault: -1 }).toArray(),
  );

  return (
    <>
      <Stepper current={1} />

      <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <section>
          <h2 className="text-ink text-sm font-semibold uppercase tracking-wider">
            Delivery address
          </h2>

          {addresses.length === 0 ? (
            <div className="border-line mt-3 rounded-lg border border-dashed p-6 text-center">
              <MapPin className="text-faint mx-auto size-7" aria-hidden />
              <p className="text-ink mt-3 text-sm font-medium">No saved addresses</p>
              <p className="text-muted mt-1 text-sm">
                Add where you would like this delivered.
              </p>
              <Button asChild variant="secondary" size="sm" className="mt-4">
                <Link href="/account/addresses">
                  <Plus className="size-4" />
                  Add an address
                </Link>
              </Button>
            </div>
          ) : (
            <ul className="mt-3 space-y-2">
              {addresses.map((address) => (
                <li key={address.id}>
                  <label className="border-line hover:border-accent-line has-[:checked]:border-accent has-[:checked]:bg-accent-soft flex cursor-pointer gap-3 rounded-lg border p-4 transition-colors">
                    <input
                      type="radio"
                      name="addressId"
                      value={address.id}
                      defaultChecked={address.isDefault}
                      className="accent-[--accent-solid] mt-1 size-4 shrink-0"
                    />
                    <div className="min-w-0 text-sm">
                      <p className="text-ink font-medium">
                        {address.fullName}
                        <span className="text-faint ml-2 text-2xs font-normal uppercase tracking-wider">
                          {address.label}
                        </span>
                      </p>
                      <p className="text-muted mt-0.5">
                        {address.line1}
                        {address.line2 ? `, ${address.line2}` : ''}
                        {address.landmark ? `, ${address.landmark}` : ''}
                      </p>
                      <p className="text-muted">
                        {address.city}, {address.state} {address.pincode}
                      </p>
                      <p className="text-faint mt-1 text-xs">{address.phone}</p>
                    </div>
                  </label>
                </li>
              ))}
            </ul>
          )}

          <h2 className="text-ink mt-8 text-sm font-semibold uppercase tracking-wider">
            Delivery speed
          </h2>
          <ul className="mt-3 space-y-2">
            <DeliveryOption
              defaultChecked
              title="Standard"
              detail={`${SHIPPING.standardDays.min}–${SHIPPING.standardDays.max} working days`}
              price={cart.pricing.shippingFee === 0 ? 'Free' : formatMoney(SHIPPING.standardFee)}
            />
            <DeliveryOption
              title="Express"
              detail={`${SHIPPING.expressDays.min}–${SHIPPING.expressDays.max} working days`}
              price={formatMoney(SHIPPING.expressFee)}
            />
          </ul>
        </section>

        <aside className="lg:sticky lg:top-28 lg:self-start">
          <div className="border-line rounded-lg border p-5">
            <h2 className="text-ink text-sm font-semibold uppercase tracking-wider">
              Order summary
            </h2>

            <p className="text-muted mt-3 text-sm">
              {cart.totalUnits} {cart.totalUnits === 1 ? 'item' : 'items'} from{' '}
              {cart.groups.length} {cart.groups.length === 1 ? 'seller' : 'sellers'}
            </p>

            <dl className="mt-4 space-y-2.5 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted">Items</dt>
                <dd className="text-ink tabular">{formatMoney(cart.pricing.subtotal)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted">Delivery</dt>
                <dd className="text-ink tabular">
                  {cart.pricing.shippingFee === 0 ? 'Free' : formatMoney(cart.pricing.shippingFee)}
                </dd>
              </div>
              <div className="border-line flex justify-between border-t pt-3">
                <dt className="text-ink font-semibold">Total payable</dt>
                <dd className="text-ink tabular text-md font-semibold">
                  {formatMoney(cart.pricing.payable)}
                </dd>
              </div>
            </dl>

            {/*
              Payment, order placement and confirmation are the next milestone.
              The control is disabled and says so, rather than being a button
              that looks live and silently does nothing.
            */}
            <Button size="cta" className="mt-5" disabled>
              Continue to payment
            </Button>

            <p className="text-faint mt-3 text-center text-2xs">
              Payment is not enabled in this build yet — the delivery step above is live and your
              bag is saved.
            </p>
          </div>
        </aside>
      </div>
    </>
  );
}

function DeliveryOption({
  title,
  detail,
  price,
  defaultChecked,
}: {
  title: string;
  detail: string;
  price: string;
  defaultChecked?: boolean;
}) {
  return (
    <li>
      <label className="border-line hover:border-accent-line has-[:checked]:border-accent has-[:checked]:bg-accent-soft flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition-colors">
        <input
          type="radio"
          name="shipping"
          defaultChecked={defaultChecked}
          className="accent-[--accent-solid] size-4 shrink-0"
        />
        <span className="flex-1 text-sm">
          <span className="text-ink block font-medium">{title}</span>
          <span className="text-muted text-xs">{detail}</span>
        </span>
        <span className="text-ink tabular text-sm font-medium">{price}</span>
      </label>
    </li>
  );
}

/**
 * The funnel, shown in full.
 *
 * Steps ahead of the current one are visible but plainly not reached yet — a
 * shopper who can see there are two steps left behaves differently from one
 * who cannot.
 */
function Stepper({ current }: { current: number }) {
  const steps = ['Bag', 'Delivery', 'Payment', 'Confirmation'];

  return (
    <ol className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      {steps.map((step, index) => {
        const done = index < current;
        const active = index === current;

        return (
          <li key={step} className="flex items-center gap-2">
            <span
              className={[
                'flex size-5 items-center justify-center rounded-full text-2xs font-semibold',
                done ? 'bg-success-500 text-white' : '',
                active ? 'bg-accent text-on-inverse' : '',
                !done && !active ? 'bg-sunken text-faint' : '',
              ].join(' ')}
              aria-hidden
            >
              {done ? <Check className="size-3" /> : index + 1}
            </span>
            <span
              className={active ? 'text-ink font-medium' : 'text-faint'}
              aria-current={active ? 'step' : undefined}
            >
              {step}
            </span>
            {index < steps.length - 1 ? (
              <span className="bg-line mx-1 h-px w-6" aria-hidden />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function CheckoutSkeleton() {
  return (
    <div className="mt-6 grid gap-8 lg:grid-cols-[minmax(0,1fr)_22rem]" aria-hidden>
      <div className="space-y-3">
        <div className="skeleton h-4 w-40 rounded-xs" />
        <div className="skeleton h-28 w-full rounded-lg" />
        <div className="skeleton h-28 w-full rounded-lg" />
      </div>
      <div className="skeleton h-64 rounded-lg" />
    </div>
  );
}
