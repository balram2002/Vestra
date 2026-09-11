'use client';

import { AlertTriangle, Banknote, CreditCard, Landmark, Smartphone, Wallet } from 'lucide-react';
import { useId, useState, useTransition } from 'react';

import { AddressFormDialog } from '@/components/account/address-form';
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

const EMPTY_GUEST = {
  fullName: '',
  phone: '',
  line1: '',
  line2: '',
  landmark: '',
  city: '',
  state: '',
  pincode: '',
};

export function CheckoutForm({
  isGuest,
  addresses,
  payable,
  codAvailable,
}: {
  /** No account. The address is typed here rather than chosen from a list. */
  isGuest: boolean;
  addresses: Address[];
  payable: number;
  codAvailable: boolean;
}) {
  const [addressId, setAddressId] = useState(
    addresses.find((a) => a.isDefault)?.id ?? addresses[0]?.id ?? '',
  );
  const [email, setEmail] = useState('');
  const [guest, setGuest] = useState(EMPTY_GUEST);
  const [method, setMethod] = useState<PaymentMethod>('UPI');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const available = METHODS.filter((m) => m.value !== 'COD' || codAvailable);
  const setField = (field: keyof typeof EMPTY_GUEST, value: string) =>
    setGuest((current) => ({ ...current, [field]: value }));

  const handleSubmit = () => {
    setError(null);

    if (!isGuest && !addressId) {
      setError('Choose a delivery address to continue.');
      return;
    }

    /*
     * A first pass on the client so the shopper is told immediately; the same
     * rules run again on the server, which is the actual control. The checks
     * follow the order of the fields, so the message always points at the
     * first thing to fix rather than an arbitrary one.
     */
    if (isGuest) {
      if (!/^\S+@\S+\.\S+$/.test(email.trim())) {
        setError('Enter a valid email address. Your order updates go there.');
        return;
      }
      if (guest.fullName.trim().length < 2) {
        setError('Enter the full name for the delivery.');
        return;
      }
      if (!/^[6-9]\d{9}$/.test(guest.phone.trim())) {
        setError('Enter a 10-digit Indian mobile number.');
        return;
      }
      if (guest.line1.trim().length < 4) {
        setError('Enter the delivery address.');
        return;
      }
      if (guest.city.trim().length < 2 || guest.state.trim().length < 2) {
        setError('Enter the city and state.');
        return;
      }
      if (!/^\d{6}$/.test(guest.pincode.trim())) {
        setError('Enter a 6-digit pincode.');
        return;
      }
    }

    startTransition(async () => {
      const result = await submitOrder(
        isGuest
          ? { guest: { email: email.trim(), address: guest }, paymentMethod: method }
          : { addressId, paymentMethod: method },
      );
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

        {isGuest ? (
          <div className="mt-3 space-y-3">
            <p className="text-muted text-sm">
              Buying as a guest.{' '}
              <a href="/login?next=/checkout" className="text-ink underline underline-offset-2">
                Sign in
              </a>{' '}
              to use a saved address and track this order from your account.
            </p>

            <GuestField
              label="Email"
              hint="Your order confirmation and tracking go here."
              value={email}
              onChange={setEmail}
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
            />

            <div className="grid gap-3 sm:grid-cols-2">
              <GuestField
                label="Full name"
                value={guest.fullName}
                onChange={(value) => setField('fullName', value)}
                autoComplete="name"
              />
              <GuestField
                label="Mobile number"
                value={guest.phone}
                onChange={(value) => setField('phone', value.replace(/\D/g, '').slice(0, 10))}
                autoComplete="tel"
                inputMode="numeric"
                placeholder="98765 43210"
              />
            </div>

            <GuestField
              label="Address"
              value={guest.line1}
              onChange={(value) => setField('line1', value)}
              autoComplete="address-line1"
              placeholder="Flat, building, street"
            />
            <GuestField
              label="Area (optional)"
              value={guest.line2}
              onChange={(value) => setField('line2', value)}
              autoComplete="address-line2"
            />

            <div className="grid gap-3 sm:grid-cols-3">
              <GuestField
                label="City"
                value={guest.city}
                onChange={(value) => setField('city', value)}
                autoComplete="address-level2"
              />
              <GuestField
                label="State"
                value={guest.state}
                onChange={(value) => setField('state', value)}
                autoComplete="address-level1"
              />
              <GuestField
                label="Pincode"
                value={guest.pincode}
                onChange={(value) => setField('pincode', value.replace(/\D/g, '').slice(0, 6))}
                autoComplete="postal-code"
                inputMode="numeric"
              />
            </div>
          </div>
        ) : null}

        <ul className={isGuest ? 'hidden' : 'mt-3 space-y-2'}>
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

        {isGuest ? null : (
          <AddressFormDialog
            label="Deliver somewhere else"
            variant="ghost"
            className="mt-2"
            onSaved={(address) => setAddressId(address.id)}
          />
        )}
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

/**
 * One guest address field.
 *
 * `autoComplete` is set on every one of these deliberately. Typing a full
 * address by hand is the slowest part of this checkout, and the browser can
 * fill most of it -- but only if the fields are named the way it expects.
 */
function GuestField({
  label,
  hint,
  value,
  onChange,
  type = 'text',
  autoComplete,
  inputMode,
  placeholder,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  autoComplete?: string;
  inputMode?: 'numeric' | 'text';
  placeholder?: string;
}) {
  const id = useId();
  const hintId = `${id}-hint`;

  return (
    <div>
      {/*
        `htmlFor` rather than a wrapping label, and the hint attached with
        `aria-describedby` rather than sitting inside it. A wrapping label folds
        every word it contains into the field's accessible NAME, so this field
        would announce as "Email Your order confirmation and tracking go here"
        instead of "Email", with the hint read as part of the label.
      */}
      <label htmlFor={id} className="text-ink block text-xs font-medium">
        {label}
      </label>
      {hint ? (
        <p id={hintId} className="text-faint mt-0.5 text-2xs">
          {hint}
        </p>
      ) : null}
      <input
        id={id}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        autoComplete={autoComplete}
        inputMode={inputMode}
        placeholder={placeholder}
        aria-describedby={hint ? hintId : undefined}
        className="border-line-strong bg-canvas text-ink placeholder:text-faint mt-1.5 h-10 w-full rounded-sm border px-3 text-sm"
      />
    </div>
  );
}
