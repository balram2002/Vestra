import { getDb } from '@/server/db/client';
import { COLLECTIONS, collections, toEntity } from '@/server/db/collections';
import { shipping } from '@/server/shipping';
import { applyEvent } from '@/server/services/shipments';

/**
 * Eshopbox tracking webhook.
 *
 * This is how a parcel moves. Sellers do not mark things delivered and neither
 * does the customer — the courier scans, Eshopbox posts here, and the shipment
 * (and through it, the order items) advances.
 *
 * That makes this endpoint privileged: it can mark an order DELIVERED, which
 * starts the return window and releases the seller's money. It gets the same
 * four defences as the payment webhook.
 *
 *  1. SIGNATURE. Unsigned bodies are refused. Without this it is an open
 *     "mark my order delivered" API.
 *  2. REPLAY. A unique index on (provider, eventId) makes redelivery a no-op
 *     by construction rather than by a race-prone lookup.
 *  3. ORDERING. Couriers deliver scans out of order more often than you would
 *     expect. `applyEvent` refuses to move a parcel backwards, so a late
 *     "in transit" cannot un-deliver something.
 *  4. ALWAYS 2xx ONCE STORED. A bug here must not trigger infinite redelivery;
 *     the outcome is journalled for ops instead.
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
    request.headers.get('x-eshopbox-signature') ??
    request.headers.get('x-vestra-signature') ??
    request.headers.get('x-webhook-signature');

  const provider = shipping();
  const event = await provider.parseWebhook(body, signature);

  if (!event.signatureValid) {
    return Response.json({ error: 'Invalid signature' }, { status: 401 });
  }

  const db = await getDb();
  const events = db.collection<WebhookRecord>(COLLECTIONS.webhookEvents);
  const now = new Date().toISOString();
  const key = `eshopbox:${event.eventId}`;

  try {
    await events.insertOne({
      _id: key,
      provider: 'eshopbox',
      eventId: event.eventId,
      type: event.event?.status ?? 'unknown',
      signatureValid: true,
      processedAt: now,
      outcome: 'received',
      raw: event.raw,
    });
  } catch {
    return Response.json({ ok: true, duplicate: true });
  }

  let outcome = 'ignored';

  try {
    if (!event.event) {
      outcome = 'unmapped-status';
    } else {
      const shipments = await collections.shipments();

      // Matched on our own shipment number first: it is the reference we sent
      // and the only identifier guaranteed to be ours. AWB is the fallback for
      // providers that omit the client reference on some event types.
      const shipment =
        (event.shipmentNumber
          ? toEntity(await shipments.findOne({ shipmentNumber: event.shipmentNumber }))
          : null) ??
        (event.awb ? toEntity(await shipments.findOne({ awb: event.awb })) : null) ??
        (event.providerShipmentId
          ? toEntity(await shipments.findOne({ providerShipmentId: event.providerShipmentId }))
          : null);

      if (!shipment) {
        outcome = 'shipment-not-found';
      } else {
        const result = await applyEvent(shipment, event.event);
        outcome = result.applied ? `applied:${event.event.status}` : `skipped:${result.reason}`;
      }
    }
  } catch (error) {
    outcome = `error:${error instanceof Error ? error.message : 'unknown'}`;
    console.error('[vestrawab:webhook:eshopbox] processing failed', error);
  }

  await events.updateOne({ _id: key }, { $set: { outcome } });

  return Response.json({ ok: true, outcome });
}
