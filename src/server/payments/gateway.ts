import 'server-only';

import type { PaymentMethod } from '@/domain/types';

/**
 * Payment gateway contract.
 *
 * Every provider — Razorpay, Stripe, a mock, cash on delivery — implements this
 * and nothing above it knows which one is in use. That is what makes swapping
 * providers a config change rather than a rewrite of the checkout.
 *
 * The shape is modelled on how real gateways actually behave, not on the happy
 * path:
 *
 *  - `createIntent` happens BEFORE the customer is redirected, so there is a
 *    provider-side record even if the browser never comes back.
 *  - `verify` is called on return from the provider and re-checks the
 *    signature; a client claiming success proves nothing.
 *  - `parseWebhook` is the AUTHORITY. A payment is captured when the webhook
 *    says so, never because a redirect landed. The redirect is a UX
 *    convenience; the webhook is the truth.
 *  - Every method is idempotent on `idempotencyKey`, because customers
 *    double-click and providers redeliver.
 */

export interface PaymentIntentInput {
  orderId: string;
  orderNumber: string;
  /** Paise. */
  amount: number;
  currency: string;
  method: PaymentMethod;
  customer: { name: string; email: string | null; phone: string | null };
  /** Unique per (order, attempt). Replaying it must not double-charge. */
  idempotencyKey: string;
}

export interface PaymentIntent {
  providerOrderId: string;
  /** Where to send the customer, when the provider hosts the payment page. */
  redirectUrl: string | null;
  /** Anything the client SDK needs. Never contains a secret. */
  clientPayload: Record<string, string | number>;
}

export type VerifyResult =
  | { status: 'CAPTURED'; providerPaymentId: string; instrumentLabel: string | null }
  | { status: 'PENDING'; providerPaymentId: string | null }
  | { status: 'FAILED'; code: string; message: string };

export interface RefundInput {
  providerPaymentId: string;
  /** Paise. Less than the original for a partial return. */
  amount: number;
  reason: string;
  idempotencyKey: string;
}

export type RefundResult =
  | { status: 'COMPLETED' | 'PROCESSING'; providerRefundId: string }
  | { status: 'FAILED'; code: string; message: string };

/** The normalised shape every provider's webhook is reduced to. */
export interface WebhookEvent {
  /** Provider's own event id. The uniqueness key for replay defence. */
  eventId: string;
  type: 'payment.captured' | 'payment.failed' | 'refund.processed' | 'refund.failed' | 'unknown';
  orderId: string | null;
  providerPaymentId: string | null;
  amount: number | null;
  signatureValid: boolean;
  raw: string;
}

export interface PaymentGateway {
  readonly name: 'razorpay' | 'stripe' | 'mock' | 'cod' | 'credit';
  /** Methods this provider can actually take. */
  readonly methods: PaymentMethod[];
  createIntent(input: PaymentIntentInput): Promise<PaymentIntent>;
  verify(providerOrderId: string, payload: Record<string, string>): Promise<VerifyResult>;
  refund(input: RefundInput): Promise<RefundResult>;
  parseWebhook(body: string, signature: string | null): Promise<WebhookEvent>;
}
