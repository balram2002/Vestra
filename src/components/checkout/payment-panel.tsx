'use client';

import { AlertTriangle } from 'lucide-react';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { formatMoney } from '@/lib/format';
import { confirmPayment } from '@/server/actions/checkout';

/**
 * The provider handoff.
 *
 * With Razorpay or Stripe this is where their SDK opens. Against the mock
 * provider the same `confirmPayment` action runs, and the mock declines a
 * deterministic slice of attempts — so the decline path below is reached by
 * real code rather than being a screen nobody has ever seen.
 *
 * A declined payment does NOT fail the order. The stock stays reserved and the
 * customer can retry, which is what a real checkout does; failing the order on
 * the first decline is how you lose a sale to a mistyped CVV.
 */
export function PaymentPanel({ orderId, amount }: { orderId: string; amount: number }) {
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [pending, startTransition] = useTransition();

  const pay = () => {
    setError(null);
    startTransition(async () => {
      const result = await confirmPayment(orderId);
      // Success redirects from the server, so arriving here means a decline.
      if (result && !result.ok) {
        setError(result.error ?? 'The payment did not go through.');
        setAttempts((n) => n + 1);
      }
    });
  };

  return (
    <div className="mt-5">
      {error ? (
        <div
          role="alert"
          className="border-danger-100 bg-danger-50 text-danger-700 mb-4 rounded-md border p-3 text-sm"
        >
          <p className="flex items-start gap-2 font-medium">
            <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
            {error}
          </p>
          <p className="mt-1.5 pl-6 text-xs">
            Nothing has been charged. Your order and the stock for it are still held — try again,
            or go back to checkout to pay a different way.
          </p>
        </div>
      ) : null}

      <Button size="cta" onClick={pay} loading={pending}>
        {attempts > 0 ? 'Try payment again' : `Pay ${formatMoney(amount)}`}
      </Button>

      {attempts >= 2 ? (
        <p className="text-muted mt-3 text-center text-xs">
          Still not working? Go back to{' '}
          <a href="/checkout" className="text-ink underline underline-offset-2">
            checkout
          </a>{' '}
          and choose cash on delivery instead.
        </p>
      ) : null}
    </div>
  );
}
