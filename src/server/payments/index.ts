import 'server-only';

import { randomUUID } from 'node:crypto';

import type { PaymentGateway } from './gateway';
import { mockGateway } from './mock-gateway';

/**
 * Gateway selection.
 *
 * One place decides which provider is live, so nothing downstream branches on
 * it. Razorpay and Stripe adapters implement the same interface and drop in
 * here; until they carry real credentials the mock is used, and it is used
 * knowingly rather than by accident — an unconfigured real provider silently
 * failing every payment is a far worse outcome than an obvious mock.
 */
export function gateway(): PaymentGateway {
  const configured = process.env.PAYMENT_PROVIDER ?? 'mock';

  switch (configured) {
    case 'razorpay':
      if (!process.env.RAZORPAY_KEY_SECRET) {
        console.warn('[vestrawab:payments] PAYMENT_PROVIDER=razorpay but no key secret; using mock.');
        return mockGateway();
      }
      throw new Error('[vestrawab:payments] The Razorpay adapter is not implemented yet.');

    case 'stripe':
      if (!process.env.STRIPE_SECRET_KEY) {
        console.warn('[vestrawab:payments] PAYMENT_PROVIDER=stripe but no secret key; using mock.');
        return mockGateway();
      }
      throw new Error('[vestrawab:payments] The Stripe adapter is not implemented yet.');

    default:
      return mockGateway();
  }
}

/**
 * Idempotency key for one payment attempt.
 *
 * Scoped to (order, attempt) rather than to the order alone, so a customer who
 * legitimately retries after a decline gets a NEW attempt — while a
 * double-clicked submit inside one attempt reuses the same key and cannot
 * charge twice.
 */
export function attemptKey(orderId: string, attempt: number): string {
  return `${orderId}:${attempt}`;
}

export function newIdempotencyKey(): string {
  return randomUUID();
}

export type {
  PaymentGateway,
  PaymentIntent,
  PaymentIntentInput,
  RefundInput,
  RefundResult,
  VerifyResult,
  WebhookEvent,
} from './gateway';
