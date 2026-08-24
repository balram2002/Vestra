import 'server-only';

import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';

import type { PaymentMethod } from '@/domain/types';

import type {
  PaymentGateway,
  PaymentIntent,
  PaymentIntentInput,
  RefundInput,
  RefundResult,
  VerifyResult,
  WebhookEvent,
} from './gateway';

/**
 * Mock gateway.
 *
 * Not a stub that always succeeds. A gateway that never fails is the reason
 * failure paths ship broken, so this one models what actually goes wrong:
 *
 *  - a deterministic slice of attempts FAIL, with real decline codes;
 *  - a slice stay PENDING, the state that produces "payment taken but no
 *    order" if the webhook is not the authority;
 *  - webhooks are HMAC-signed and verified, so the signature path is exercised;
 *  - replayed events are detectable, because `eventId` is stable per payment.
 *
 * Which outcome an attempt gets is derived from the idempotency key, so a test
 * can force a decline by choosing the key, and a retry of the SAME attempt
 * always lands on the same outcome — as a real provider would.
 */

const SECRET = () => process.env.MOCK_PAYMENT_SECRET ?? 'vestra-mock-webhook-secret';

/** Deterministic 0..99 bucket for an attempt. */
function bucket(key: string): number {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i++) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % 100;
}

/** Real-world decline reasons, so the UI has something specific to say. */
const DECLINES = [
  { code: 'insufficient_funds', message: 'Your bank declined the payment for insufficient funds.' },
  { code: 'card_expired', message: 'That card has expired. Try another payment method.' },
  { code: 'do_not_honour', message: 'Your bank declined the payment. Contact them or try another method.' },
  { code: 'authentication_failed', message: 'The 3-D Secure check was not completed in time.' },
  { code: 'limit_exceeded', message: 'This exceeds the daily limit on your card.' },
];

function sign(body: string): string {
  return createHmac('sha256', SECRET()).update(body).digest('hex');
}

export function mockGateway(): PaymentGateway {
  return {
    name: 'mock',
    methods: ['CARD', 'UPI', 'NETBANKING', 'WALLET', 'COD'] as PaymentMethod[],

    async createIntent(input: PaymentIntentInput): Promise<PaymentIntent> {
      // The provider record exists before the customer leaves, so an abandoned
      // checkout is still reconcilable.
      const providerOrderId = `mock_order_${input.idempotencyKey.slice(0, 18)}`;

      return {
        providerOrderId,
        redirectUrl: null,
        clientPayload: {
          providerOrderId,
          amount: input.amount,
          currency: input.currency,
          orderNumber: input.orderNumber,
        },
      };
    },

    async verify(providerOrderId, payload): Promise<VerifyResult> {
      const key = payload.idempotencyKey ?? providerOrderId;
      const roll = bucket(key);

      // 8% decline, 4% still pending at redirect, the rest captured.
      if (roll < 8) {
        const decline = DECLINES[roll % DECLINES.length]!;
        return { status: 'FAILED', code: decline.code, message: decline.message };
      }

      if (roll < 12) {
        return { status: 'PENDING', providerPaymentId: `mock_pay_${key.slice(0, 14)}` };
      }

      const method = payload.method ?? 'CARD';
      return {
        status: 'CAPTURED',
        providerPaymentId: `mock_pay_${key.slice(0, 14)}`,
        instrumentLabel: instrumentFor(method, key),
      };
    },

    async refund(input: RefundInput): Promise<RefundResult> {
      // Refunds fail rarely but they do fail, and finance needs that path.
      if (bucket(input.idempotencyKey) < 3) {
        return {
          status: 'FAILED',
          code: 'refund_rejected',
          message: 'The provider rejected the refund. The original method may be closed.',
        };
      }

      return {
        status: bucket(input.idempotencyKey) < 40 ? 'PROCESSING' : 'COMPLETED',
        providerRefundId: `mock_rfnd_${randomUUID().slice(0, 12)}`,
      };
    },

    async parseWebhook(body: string, signature: string | null): Promise<WebhookEvent> {
      const expected = sign(body);
      let signatureValid = false;

      if (signature) {
        const a = Buffer.from(signature);
        const b = Buffer.from(expected);
        // Length check first: timingSafeEqual throws on a length mismatch.
        signatureValid = a.length === b.length && timingSafeEqual(a, b);
      }

      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(body) as Record<string, unknown>;
      } catch {
        return {
          eventId: `malformed_${randomUUID()}`,
          type: 'unknown',
          orderId: null,
          providerPaymentId: null,
          amount: null,
          signatureValid,
          raw: body.slice(0, 2000),
        };
      }

      const type = String(parsed.type ?? '');

      return {
        eventId: String(parsed.eventId ?? `mock_evt_${randomUUID()}`),
        type:
          type === 'payment.captured' ||
          type === 'payment.failed' ||
          type === 'refund.processed' ||
          type === 'refund.failed'
            ? type
            : 'unknown',
        orderId: parsed.orderId ? String(parsed.orderId) : null,
        providerPaymentId: parsed.providerPaymentId ? String(parsed.providerPaymentId) : null,
        amount: typeof parsed.amount === 'number' ? parsed.amount : null,
        signatureValid,
        raw: body.slice(0, 2000),
      };
    },
  };
}

/** A believable instrument label for the receipt. */
function instrumentFor(method: string, key: string): string {
  const last4 = String(1000 + (bucket(key) * 7) % 9000);
  switch (method) {
    case 'UPI':
      return `${key.slice(0, 6).toLowerCase()}@okhdfcbank`;
    case 'NETBANKING':
      return 'HDFC Bank net banking';
    case 'WALLET':
      return 'Paytm wallet';
    case 'COD':
      return 'Cash on delivery';
    default:
      return `HDFC •••• ${last4}`;
  }
}

/** Exposed so the dev webhook simulator can sign a payload correctly. */
export function signMockWebhook(body: string): string {
  return sign(body);
}
