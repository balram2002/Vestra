import 'server-only';

import type { FulfillmentStatus, ShipmentStatus } from '@/domain/enums';
import type { Manifest, Order, OrderItem, SellerLocation, SellerOrder, Shipment, ShipmentEvent } from '@/domain/types';
import { entityId } from '@/lib/ids';
import { createRng } from '@/lib/random';

import { describeStatus } from '../shipping/eshopbox/status';
import { issueAwbAt } from '../shipping/simulation';

/**
 * Parcels for the seeded order history.
 *
 * Without these, every historical order shows an empty tracking panel and the
 * seller's shipment queue starts life empty — which makes the whole fulfilment
 * surface look broken rather than idle.
 *
 * The scan history is derived from each order's OWN timestamps rather than from
 * the simulator's random projection. That matters: the projection produces a
 * failed delivery or an RTO for a share of parcels, and applying it to an order
 * already recorded as DELIVERED would have the tracking panel contradict the
 * order status directly above it.
 */

/** Where each seller-order status leaves its parcel. */
const SHIPMENT_STATUS_FOR: Partial<Record<FulfillmentStatus, ShipmentStatus>> = {
  PACKED: 'LABEL_GENERATED',
  READY_FOR_PICKUP: 'PICKUP_SCHEDULED',
  SHIPPED: 'PICKED_UP',
  IN_TRANSIT: 'IN_TRANSIT',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
  // A returned or refunded order was delivered first; the forward parcel is done.
  RETURN_REQUESTED: 'DELIVERED',
  RETURN_APPROVED: 'DELIVERED',
  RETURN_PICKUP: 'DELIVERED',
  RETURNED: 'DELIVERED',
  REFUND_INITIATED: 'DELIVERED',
  REFUNDED: 'DELIVERED',
};

/** Order of the forward journey, used to truncate the scan list. */
const PROGRESSION: ShipmentStatus[] = [
  'LABEL_GENERATED',
  'PICKUP_SCHEDULED',
  'PICKED_UP',
  'IN_TRANSIT',
  'REACHED_HUB',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
];

const HUBS = [
  'Bengaluru Hub',
  'Mumbai Hub',
  'Delhi NCR Hub',
  'Hyderabad Hub',
  'Chennai Hub',
  'Kolkata Hub',
  'Pune Hub',
  'Ahmedabad Hub',
];

export interface GeneratedShipments {
  shipments: Shipment[];
  manifests: Manifest[];
  /** orderItemId -> shipmentId, so the seeder can stamp the items. */
  itemShipmentIds: Record<string, string>;
}

export function generateShipments(args: {
  orders: Order[];
  sellerOrders: SellerOrder[];
  items: OrderItem[];
  locations: SellerLocation[];
  now: Date;
}): GeneratedShipments {
  const rng = createRng('vestra-shipments');
  const { orders, sellerOrders, items, locations, now } = args;

  const orderById = new Map(orders.map((order) => [order.id, order]));
  const itemsBySellerOrder = new Map<string, OrderItem[]>();
  for (const item of items) {
    const list = itemsBySellerOrder.get(item.sellerOrderId);
    if (list) list.push(item);
    else itemsBySellerOrder.set(item.sellerOrderId, [item]);
  }

  const pickupBySeller = new Map<string, SellerLocation>();
  for (const location of locations) {
    if (!pickupBySeller.has(location.sellerId) && location.isPickupEnabled) {
      pickupBySeller.set(location.sellerId, location);
    }
  }

  const shipments: Shipment[] = [];
  const itemShipmentIds: Record<string, string> = {};
  /** AWBs are unique in the schema, so uniqueness is guaranteed, not hoped for. */
  const issuedAwbs = new Set<string>();
  /** Parcels awaiting handover, grouped so a manifest can be closed per seller. */
  const manifestCandidates = new Map<string, Shipment[]>();

  let sequence = 0;

  for (const sellerOrder of sellerOrders) {
    const status = SHIPMENT_STATUS_FOR[sellerOrder.status];
    if (!status) continue;

    const order = orderById.get(sellerOrder.orderId);
    const pickup = pickupBySeller.get(sellerOrder.sellerId);
    if (!order || !pickup) continue;

    const parcelItems = (itemsBySellerOrder.get(sellerOrder.id) ?? []).filter(
      (item) => item.status !== 'CANCELLED',
    );
    if (parcelItems.length === 0) continue;

    sequence += 1;
    const shipmentId = entityId('shp');
    const financialYear = fiscalYearOf(new Date(sellerOrder.placedAt));
    const shipmentNumber = `SH${financialYear}${String(sequence).padStart(7, '0')}`;

    const packedAt = sellerOrder.packedAt ?? sellerOrder.placedAt;
    const awb = allocateAwb(shipmentNumber, new Date(packedAt), issuedAwbs);

    const weightGrams = parcelItems.reduce(
      (sum, item) => sum + 220 * Math.max(1, item.quantity - item.cancelledQuantity),
      0,
    );
    const declaredValue = parcelItems.reduce((sum, item) => sum + item.lineTotal, 0);

    const hub = HUBS[rng.int(0, HUBS.length - 1)];
    const events = scanHistory({
      shipmentId,
      status,
      packedAt,
      shippedAt: sellerOrder.shippedAt,
      deliveredAt: sellerOrder.deliveredAt,
      originCity: pickup.city,
      hub,
      now,
    });

    const shipment: Shipment = {
      id: shipmentId,
      shipmentNumber,
      orderId: order.id,
      orderNumber: order.orderNumber,
      sellerOrderId: sellerOrder.id,
      sellerId: sellerOrder.sellerId,
      items: parcelItems.map((item) => ({
        orderItemId: item.id,
        quantity: Math.max(1, item.quantity - item.cancelledQuantity),
      })),
      status,
      direction: 'FORWARD',
      provider: 'eshopbox',
      providerShipmentId: `esb_${shipmentNumber.toLowerCase()}`,
      awb,
      carrier: CARRIERS[rng.int(0, CARRIERS.length - 1)],
      carrierServiceType: 'Eshopbox Standard',
      trackingUrl: `/track/${awb}`,
      labelUrl: `/seller/shipments/${shipmentId}/label`,
      manifestId: null,
      invoiceId: null,
      pickupLocationId: pickup.id,
      pickupScheduledAt:
        PROGRESSION.indexOf(status) >= PROGRESSION.indexOf('PICKUP_SCHEDULED')
          ? addHours(packedAt, 2)
          : null,
      pickedUpAt: events.find((e) => e.status === 'PICKED_UP')?.occurredAt ?? sellerOrder.shippedAt,
      deliveryAddress: order.shippingAddress,
      estimatedDeliveryFrom: order.estimatedDeliveryFrom,
      estimatedDeliveryTo: order.estimatedDeliveryTo,
      // Taken from the scan rather than the seller order, so the timestamp the
      // tracking panel shows is the same one the parcel record holds.
      deliveredAt: events.find((e) => e.status === 'DELIVERED')?.occurredAt ?? sellerOrder.deliveredAt,
      deliveryAttempts: 0,
      failureReason: null,
      weightGrams,
      dimensionsCm: { length: 30, width: 24, height: 10 },
      declaredValue,
      codAmount: order.paymentMethod === 'COD' ? declaredValue : 0,
      events,
      createdAt: packedAt,
      updatedAt: events.at(-1)?.occurredAt ?? packedAt,
    };

    shipments.push(shipment);
    for (const item of parcelItems) itemShipmentIds[item.id] = shipmentId;

    // Anything already picked up went out on a manifest at the time.
    if (PROGRESSION.indexOf(status) >= PROGRESSION.indexOf('PICKED_UP')) {
      const key = `${sellerOrder.sellerId}:${packedAt.slice(0, 10)}`;
      const bucket = manifestCandidates.get(key);
      if (bucket) bucket.push(shipment);
      else manifestCandidates.set(key, [shipment]);
    }
  }

  /* ---------------------------------------------------------- manifests */

  const manifests: Manifest[] = [];
  let manifestSequence = 0;

  for (const [key, bucket] of manifestCandidates) {
    // One sheet per seller per day, which is how a real pickup run works.
    if (bucket.length === 0) continue;
    manifestSequence += 1;

    const [sellerId, day] = key.split(':');
    const closedAt = `${day}T13:30:00.000Z`;
    const manifest: Manifest = {
      id: entityId('mfst'),
      manifestNumber: `MF${fiscalYearOf(new Date(day))}${String(manifestSequence).padStart(6, '0')}`,
      sellerId,
      pickupLocationId: bucket[0].pickupLocationId,
      shipmentIds: bucket.map((shipment) => shipment.id),
      carrier: bucket[0].carrier ?? 'Eshopbox',
      status: 'HANDED_OVER',
      documentUrl: null,
      createdAt: closedAt,
      closedAt,
    };

    manifests.push(manifest);
    for (const shipment of bucket) shipment.manifestId = manifest.id;
  }

  return { shipments, manifests, itemShipmentIds };
}

/* ------------------------------------------------------------- helpers */

const CARRIERS = ['Bluedart', 'Delhivery', 'Ekart', 'XpressBees', 'Shadowfax'];

function addHours(iso: string, hours: number): string {
  return new Date(Date.parse(iso) + hours * 3_600_000).toISOString();
}

function fiscalYearOf(date: Date): string {
  const year = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  return `${year}${String(year + 1).slice(2)}`;
}

/**
 * The scans a parcel would have collected, anchored to the order's real
 * packed / shipped / delivered times so the tracking panel and the order
 * status can never disagree.
 */
function scanHistory(args: {
  shipmentId: string;
  status: ShipmentStatus;
  packedAt: string;
  shippedAt: string | null;
  deliveredAt: string | null;
  originCity: string;
  hub: string;
  now: Date;
}): ShipmentEvent[] {
  const { shipmentId, status, packedAt, shippedAt, deliveredAt, originCity, hub, now } = args;
  const reached = PROGRESSION.indexOf(status);

  const scan = (
    scanStatus: ShipmentStatus,
    occurredAt: string,
    location: string | null,
  ): ShipmentEvent => {
    const copy = describeStatus(scanStatus, 'FORWARD');
    return {
      id: entityId('shev'),
      shipmentId,
      status: scanStatus,
      title: copy.title,
      description: copy.description,
      location,
      providerStatusCode: null,
      occurredAt,
    };
  };

  const events: ShipmentEvent[] = [];
  let previous = 0;

  const push = (scanStatus: ShipmentStatus, occurredAt: string, location: string | null) => {
    if (PROGRESSION.indexOf(scanStatus) > reached) return;

    // Couriers do not scan at 3am. Nudging each scan into working hours is
    // what stops the timeline reading "Delivered 5:00 am", which is the kind
    // of detail that makes an otherwise plausible screen look generated.
    let at = Date.parse(withinWorkingHours(occurredAt, scanStatus));

    // Keep the sequence monotonic AND legible. Shifting a scan into working
    // hours can push it behind the one before it on a fast metro delivery, and
    // two scans a few seconds apart render as the same minute — which looks
    // like a duplicate row on the timeline rather than two real events.
    const MIN_GAP_MS = 25 * 60_000;
    if (previous && at < previous + MIN_GAP_MS) at = previous + MIN_GAP_MS;

    // Never record a scan in the future, even if an order's own timestamps
    // drifted ahead of the seed clock.
    if (at > now.getTime()) return;

    previous = at;
    events.push(scan(scanStatus, new Date(at).toISOString(), location));
  };

  push('LABEL_GENERATED', packedAt, originCity);
  push('PICKUP_SCHEDULED', addHours(packedAt, 2), originCity);

  const pickedUp = shippedAt ?? addHours(packedAt, 8);
  push('PICKED_UP', pickedUp, originCity);
  push('IN_TRANSIT', addHours(pickedUp, 6), originCity);

  // Work backwards from delivery when it happened, forwards from pickup when
  // it has not: the last leg is what the customer is actually watching.
  const delivered = deliveredAt ?? addHours(pickedUp, 60);
  push('REACHED_HUB', addHours(delivered, -14), hub);
  push('OUT_FOR_DELIVERY', addHours(delivered, -6), hub);
  push('DELIVERED', delivered, hub);

  return events;
}

/**
 * Allocate an AWB that is definitely unique.
 *
 * `issueAwbAt` derives the number from the issue minute plus a hash suffix, so
 * two parcels labelled in the same minute can still collide. A courier
 * allocates from a sequence and never repeats; the equivalent here is to salt
 * the key and re-derive until the number is free. Relying on hash entropy alone
 * is what the unique index rejected.
 */
function allocateAwb(key: string, at: Date, issued: Set<string>): string {
  for (let salt = 0; salt < 500; salt++) {
    const awb = issueAwbAt(salt === 0 ? key : `${key}#${salt}`, at);
    if (!issued.has(awb)) {
      issued.add(awb);
      return awb;
    }
  }
  // 500 collisions in the same minute is not a data problem, it is a bug.
  throw new Error(`Could not allocate a unique AWB for ${key}`);
}

/** IST is what a courier in this market operates on, and what we render in. */
const IST_OFFSET_MS = 5.5 * 3_600_000;

/**
 * Move a scan into the hours a courier actually works.
 *
 * Hub movements run late; doorstep events do not. A parcel handed over at
 * 23:40 or delivered at 05:00 is not a rounding artefact a reader forgives —
 * it reads as fabricated data, because it is.
 */
function withinWorkingHours(iso: string, status: ShipmentStatus): string {
  const window =
    status === 'OUT_FOR_DELIVERY'
      ? { from: 9, to: 12 }
      : status === 'DELIVERED'
        ? { from: 11, to: 20 }
        : status === 'LABEL_GENERATED' || status === 'PICKUP_SCHEDULED'
          ? { from: 9, to: 18 }
          : status === 'PICKED_UP'
            ? { from: 11, to: 20 }
            : // Hub scans legitimately happen through the night.
              { from: 0, to: 23 };

  const ist = new Date(Date.parse(iso) + IST_OFFSET_MS);
  const hour = ist.getUTCHours();
  if (hour >= window.from && hour <= window.to) return iso;

  // Deterministic placement inside the window, derived from the minute so two
  // scans on the same parcel do not collapse onto the same instant.
  const span = window.to - window.from;
  const placed = window.from + (ist.getUTCMinutes() % Math.max(1, span + 1));
  ist.setUTCHours(placed, ist.getUTCMinutes(), 0, 0);
  return new Date(ist.getTime() - IST_OFFSET_MS).toISOString();
}
