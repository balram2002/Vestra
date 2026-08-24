import { collections } from '@/server/db/collections';
import { getDb } from '@/server/db/client';
import { COLLECTIONS } from '@/server/db/collections';
import { gateway } from '@/server/payments';
import { settlePayment } from '@/server/services/orders';
import { applyRefundResult } from '@/server/services/returns';

/**
 * Payment provider webhook.
 *
 * This endpoint, not the browser redirect, is the AUTHORITY on whether money
 * moved. A customer whose connection drops after paying still gets a confirmed
 * order because this arrives independently.
 *
 * Four defences, in order:
 *
 *  1. SIGNATURE. An unsigned or badly-signed body is rejected outright. Without
 *     this the endpoint is an open "mark my order paid" API.
 *  2. REPLAY. Providers redeliver on any non-2xx, and at-least-once delivery
 *     means duplicates are normal, not exceptional. A unique index on
 *     (provider, eventId) makes the second delivery a no-op by construction
 *     rather than by a race-prone "have I seen this?" check.
 *  3. IDEMPOTENT APPLY. Even if a duplicate slips past, `settlePayment` finds
 *     the payment already captured and changes nothing.
 *  4. ALWAYS 2xx ONCE STORED. A processing bug must not cause infinite
 *     redelivery; the event is journalled and the failure surfaced internally.
 */

interface WebhookRecord {
  _id: string;
  provider: string;
  eventId: string;
  type: string;
  signatureValid: boolean;
  processedAt: string;
  outcome: string;
  raw: string;
}

export async function POST(request: Request) {
  const body = await request.text();
  const signature =
    request.headers.get('x-vestra-signature') ??
    request.headers.get('x-razorpay-signature') ??
    request.headers.get('stripe-signature');

  const provider = gateway();
  const event = await provider.parseWebhook(body, signature);

  // 1. Signature.
  if (!event.signatureValid) {
    // 401, not 400: this is an authentication failure, and the provider should
    // not keep retrying a body we will never trust.
    return Response.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const db = await getDb();
  const events = db.collection<WebhookRecord>(COLLECTIONS.webhookEvents);
  const now = new Date().toISOString();

  // 2. Replay. The unique index does the work; a duplicate throws here.
  try {
    await events.insertOne({
      _id: `${provider.name}:${event.eventId}`,
      provider: provider.name,
      eventId: event.eventId,
      type: event.type,
      signatureValid: true,
      processedAt: now,
      outcome: 'received',
      raw: event.raw,
    });
  } catch {
    // Already handled. 200 so the provider stops redelivering.
    return Response.json({ ok: true, duplicate: true });
  }

  let outcome = 'ignored';

  try {
    switch (event.type) {
      case 'payment.captured':
      case 'payment.failed': {
        const payments = await collections.payments();
        const payment = event.providerPaymentId
          ? await payments.findOne({ providerPaymentId: event.providerPaymentId })
          : event.orderId
            ? await payments.findOne({ orderId: event.orderId })
            : null;

        if (!payment) {
          outcome = 'payment-not-found';
          break;
        }

        const result = await settlePayment(
          payment.id,
          event.type === 'payment.captured'
            ? {
                status: 'CAPTURED',
                providerPaymentId: event.providerPaymentId ?? payment.providerOrderId ?? '',
                instrumentLabel: payment.instrumentLabel,
              }
            : {
                status: 'FAILED',
                code: 'provider_declined',
                message: 'The payment was declined by the provider.',
              },
        );

        outcome = result.alreadySettled ? 'already-settled' : `applied:${event.type}`;
        break;
      }

      case 'refund.processed':
      case 'refund.failed': {
        const refunds = await collections.refunds();
        const refund = event.orderId
          ? await refunds.findOne({ orderId: event.orderId, status: { $in: ['PENDING', 'PROCESSING'] } })
          : null;

        if (!refund) {
          outcome = 'refund-not-found';
          break;
        }

        await applyRefundResult(
          refund.id,
          event.type === 'refund.processed'
            ? { status: 'COMPLETED', providerRefundId: event.providerPaymentId ?? refund.id }
            : { status: 'FAILED', code: 'refund_failed', message: 'The provider rejected the refund.' },
        );

        outcome = `applied:${event.type}`;
        break;
      }

      default:
        outcome = 'unknown-type';
    }
  } catch (error) {
    // 4. Journal the failure, still return 200. Redelivery would not help — the
    // event is already recorded as seen — and ops needs to see this.
    outcome = `error:${error instanceof Error ? error.message : 'unknown'}`;
    console.error('[vestra:webhook] processing failed', error);
  }

  await events.updateOne({ _id: `${provider.name}:${event.eventId}` }, { $set: { outcome } });

  return Response.json({ ok: true, outcome });
}
