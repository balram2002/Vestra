'use client';

import { AlertTriangle, Banknote, CreditCard, Landmark, Smartphone, Wallet } from 'lucide-react';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { SHIPPING } from '@/config/business';
import type { Address, PaymentMethod } from '@/domain/types';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/format';
import { submitOrder } from '@/server/actions/checkout';

/**
 * Checkout.
 *
 * One form, one submit, one server action. The steps are visual grouping rather
 * than separate pages, because a three-page checkout loses people at every hop
 * and none of the steps here need a round trip to validate.
 *
 * The total shown is the server's, passed in as a prop and never recomputed on
 * the client — the client cannot be allowed a say in what is charged, and
 * `placeOrder` re-derives it again anyway before taking payment.
 */

const METHODS: Array<{
  value: PaymentMethod;
  label: string;
  hint: string;
  icon: typeof CreditCard;
}> = [
  { value: 'UPI', label: 'UPI', hint: 'GPay, PhonePe, Paytm or any UPI app', icon: Smartphone },
  { value: 'CARD', label: 'Credit or debit card', hint: 'Visa, Mastercard, RuPay, Amex', icon: CreditCard },
  { value: 'NETBANKING', label: 'Net banking', hint: 'All major Indian banks', icon: Landmark },
  { value: 'WALLET', label: 'Wallet', hint: 'Paytm, Amazon Pay, Mobikwik', icon: Wallet },
  { value: 'COD', label: 'Cash on delivery', hint: `Adds ${formatMoney(SHIPPING.codFee)}`, icon: Banknote },
];

export function CheckoutForm({
  addresses,
  payable,
  codAvailable,
}: {
  addresses: Address[];
  payable: number;
  codAvailable: boolean;
}) {
  const [addressId, setAddressId] = useState(
    addresses.find((a) => a.isDefault)?.id ?? addresses[0]?.id ?? '',
  );
  const [method, setMethod] = useState<PaymentMethod>('UPI');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const available = METHODS.filter((m) => m.value !== 'COD' || codAvailable);

  const handleSubmit = () => {
    setError(null);

    if (!addressId) {
      setError('Choose a delivery address to continue.');
      return;
    }

    startTransition(async () => {
      const result = await submitOrder({ addressId, paymentMethod: method });
      // A success redirects from the server, so reaching here means it failed.
      if (result && !result.ok) setError(result.error ?? 'Could not place your order.');
    });
  };

  return (
    <div className="space-y-9">
      {error ? (
        <p
          role="alert"
          className="border-danger-100 bg-danger-50 text-danger-700 flex items-start gap-2 rounded-md border p-3 text-sm"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      {/* ------------------------------------------------------- address */}

      <section>
        <h2 className="text-faint text-2xs font-medium uppercase tracking-[0.14em]">
          Delivery address
        </h2>

        <ul className="mt-3 space-y-2">
          {addresses.map((address) => (
            <li key={address.id}>
              <label
                className={cn(
                  'flex cursor-pointer gap-3 rounded-lg border p-4 transition-colors',
                  address.id === addressId
                    ? 'border-ink bg-sunken'
                    : 'border-line hover:border-line-bold',
                )}
              >
                <input
                  type="radio"
                  name="addressId"
                  value={address.id}
                  checked={address.id === addressId}
                  onChange={() => setAddressId(address.id)}
                  className="accent-ink mt-1 size-4 shrink-0"
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
      </section>

      {/* ------------------------------------------------------- payment */}

      <section>
        <h2 className="text-faint text-2xs font-medium uppercase tracking-[0.14em]">
          Payment method
        </h2>

        <ul className="mt-3 space-y-2">
          {available.map(({ value, label, hint, icon: Icon }) => (
            <li key={value}>
              <label
                className={cn(
                  'flex cursor-pointer items-center gap-3 rounded-lg border p-4 transition-colors',
                  value === method ? 'border-ink bg-sunken' : 'border-line hover:border-line-bold',
                )}
              >
                <input
                  type="radio"
                  name="paymentMethod"
                  value={value}
                  checked={value === method}
                  onChange={() => setMethod(value)}
                  className="accent-ink size-4 shrink-0"
                />
                <Icon className="text-muted size-5 shrink-0" aria-hidden strokeWidth={1.5} />
                <span className="flex-1 text-sm">
                  <span className="text-ink block font-medium">{label}</span>
                  <span className="text-muted text-xs">{hint}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>

        {!codAvailable ? (
          <p className="text-faint mt-2.5 text-xs">
            Cash on delivery is unavailable on this order — one of the sellers does not offer it,
            or the total is above {formatMoney(SHIPPING.maxCodOrderValue)}.
          </p>
        ) : null}
      </section>

      <div>
        <Button size="cta" onClick={handleSubmit} loading={pending}>
          {method === 'COD' ? 'Place order' : `Pay ${formatMoney(payable)}`}
        </Button>

        <p className="text-faint mt-3 text-center text-2xs">
          Your card details never touch our servers. Stock is reserved the moment you place this
          order.
        </p>
      </div>
    </div>
  );
}
