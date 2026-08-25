import 'server-only';

import { SHIPMENT_STATUS_META, SHIPMENT_TO_FULFILLMENT, type ShipmentStatus } from '@/domain/enums';
import type { Manifest, OrderAddress, Shipment, ShipmentEvent } from '@/domain/types';
import { entityId } from '@/lib/ids';

import { collections, toEntities, toEntity } from '../db/collections';
import { nextManifestNumber, nextShipmentNumber } from '../db/sequences';
import { shipping, ShippingProviderError, type TrackingEvent } from '../shipping';
import { shouldAdvance } from '../shipping/eshopbox/status';
import { notifyQuietly } from './notifications';
import { transitionItem } from './orders';

/**
 * Fulfilment.
 *
 * A shipment is the physical parcel: one seller, one pickup address, one AWB.
 * It sits between the seller order (a commercial grouping) and the order items
 * (what the customer bought), because those three do not map one to one — a
 * seller can split a parcel, and a return travels back as its own shipment.
 *
 * The invariant this module exists to hold: THE COURIER OWNS THE PARCEL'S
 * STATUS, AND THE PARCEL'S STATUS OWNS THE ITEMS'. Nothing marks an item
 * delivered directly; a scan moves the shipment, and the shipment moves its
 * items through the same guarded transition every other caller uses. That is
 * what stops the customer's order page and the courier's tracking page from
 * telling two different stories.
 */

/* ---------------------------------------------------------------- reading */

export async function getShipment(shipmentId: string): Promise<Shipment | null> {
  const shipments = await collections.shipments();
  return toEntity(await shipments.findOne({ _id: shipmentId }));
}

export async function getShipmentByNumber(shipmentNumber: string): Promise<Shipment | null> {
  const shipments = await collections.shipments();
  return toEntity(await shipments.findOne({ shipmentNumber }));
}

export async function listShipmentsForOrder(orderId: string): Promise<Shipment[]> {
  const shipments = await collections.shipments();
  return toEntities(await shipments.find({ orderId }).sort({ createdAt: 1 }).toArray());
}

export interface SellerShipmentFilter {
  status?: ShipmentStatus | 'ACTION_NEEDED';
  search?: string;
  limit?: number;
}

export async function listSellerShipments(
  sellerId: string,
  filter: SellerShipmentFilter = {},
): Promise<Shipment[]> {
  const shipments = await collections.shipments();
  const query: Record<string, unknown> = { sellerId };

  if (filter.status === 'ACTION_NEEDED') {
    // What the seller still owes work on: a parcel with no label, or one
    // labelled but never handed over.
    query.status = { $in: ['CREATED', 'LABEL_GENERATED', 'PICKUP_SCHEDULED'] };
  } else if (filter.status) {
    query.status = filter.status;
  }

  if (filter.search?.trim()) {
    const term = filter.search.trim();
    query.$or = [
      { shipmentNumber: { $regex: term, $options: 'i' } },
      { awb: { $regex: term, $options: 'i' } },
      { orderNumber: { $regex: term, $options: 'i' } },
    ];
  }

  return toEntities(
    await shipments
      .find(query)
      .sort({ createdAt: -1 })
      .limit(filter.limit ?? 100)
      .toArray(),
  );
}

/* --------------------------------------------------------------- creating */

/**
 * Register a parcel for the packable items on a seller order.
 *
 * Called when the seller marks the order packed. Items already cancelled or
 * already in another parcel are excluded, so a partially cancelled order still
 * ships and a second parcel picks up only what is left.
 */
export async function createShipmentForSellerOrder(
  sellerOrderId: string,
  options: { itemIds?: string[] } = {},
): Promise<{ ok: boolean; error?: string; shipmentId?: string }> {
  const sellerOrders = await collections.sellerOrders();
  const sellerOrder = toEntity(await sellerOrders.findOne({ _id: sellerOrderId }));
  if (!sellerOrder) return { ok: false, error: 'Seller order not found.' };

  const orders = await collections.orders();
  const order = toEntity(await orders.findOne({ _id: sellerOrder.orderId }));
  if (!order) return { ok: false, error: 'Order not found.' };

  const itemCol = await collections.orderItems();
  const allItems = toEntities(await itemCol.find({ sellerOrderId }).toArray());

  const shippable = allItems.filter((item) => {
    if (item.status === 'CANCELLED') return false;
    if (item.shipmentId) return false;
    if (options.itemIds && !options.itemIds.includes(item.id)) return false;
    return item.quantity - item.cancelledQuantity > 0;
  });

  if (shippable.length === 0) {
    return { ok: false, error: 'Every item on this order is already in a parcel or cancelled.' };
  }

  const locations = await collections.sellerLocations();
  const pickup = toEntity(
    await locations.findOne({ sellerId: sellerOrder.sellerId, isPickupEnabled: true }),
  );
  if (!pickup) {
    return { ok: false, error: 'Add a pickup address in store settings before shipping.' };
  }

  // Volumetric weight matters: couriers bill on whichever is greater, so the
  // declared figure has to be the same one the label will carry.
  const weightGrams = shippable.reduce(
    (sum, item) => sum + 220 * (item.quantity - item.cancelledQuantity),
    0,
  );
  const declaredValue = shippable.reduce((sum, item) => sum + item.lineTotal, 0);

  const shipmentNumber = await nextShipmentNumber();
  const iso = new Date().toISOString();
  const provider = shipping();

  let providerShipmentId: string | null = null;
  try {
    const created = await provider.createShipment({
      shipmentNumber,
      orderNumber: order.orderNumber,
      sellerOrderNumber: sellerOrder.sellerOrderNumber,
      paymentMode: order.paymentMethod === 'COD' ? 'COD' : 'PREPAID',
      codAmount: order.paymentMethod === 'COD' ? declaredValue : 0,
      declaredValue,
      weightGrams,
      dimensionsCm: { length: 30, width: 24, height: 10 },
      pickup: {
        name: pickup.contactName,
        phone: pickup.phone,
        email: null,
        line1: pickup.line1,
        line2: pickup.line2,
        city: pickup.city,
        state: pickup.state,
        pincode: pickup.pincode,
        country: pickup.country,
      },
      delivery: toContact(order.shippingAddress),
      items: shippable.map((item) => ({
        orderItemId: item.id,
        sku: item.sku,
        name: item.productTitle,
        quantity: item.quantity - item.cancelledQuantity,
        unitPrice: item.unitSellingPrice,
        discount: item.discount + item.couponDiscount,
        lineTotal: item.lineTotal,
        taxRatePercent: item.taxRatePercent,
        hsnCode: item.hsnCode,
        weightGrams: 220,
      })),
      expectedShipDate: sellerOrder.dispatchBy,
      promiseDeliveryDate: order.estimatedDeliveryTo,
    });
    providerShipmentId = created.providerShipmentId;
  } catch (error) {
    // The courier being down must not lose the seller's work. The parcel is
    // still recorded so it appears in the queue and can be retried; only the
    // provider link is missing.
    if (!(error instanceof ShippingProviderError)) throw error;
    console.error('[vestra:shipping] createShipment failed', error);
  }

  const shipment: Shipment = {
    id: entityId('shp'),
    shipmentNumber,
    orderId: order.id,
    orderNumber: order.orderNumber,
    sellerOrderId,
    sellerId: sellerOrder.sellerId,
    items: shippable.map((item) => ({
      orderItemId: item.id,
      quantity: item.quantity - item.cancelledQuantity,
    })),
    status: 'CREATED',
    direction: 'FORWARD',
    provider: provider.name,
    providerShipmentId,
    awb: null,
    carrier: null,
    carrierServiceType: null,
    trackingUrl: null,
    labelUrl: null,
    manifestId: null,
    invoiceId: null,
    pickupLocationId: pickup.id,
    pickupScheduledAt: null,
    pickedUpAt: null,
    deliveryAddress: order.shippingAddress,
    estimatedDeliveryFrom: order.estimatedDeliveryFrom,
    estimatedDeliveryTo: order.estimatedDeliveryTo,
    deliveredAt: null,
    deliveryAttempts: 0,
    failureReason: providerShipmentId ? null : 'Courier unreachable; retry label generation.',
    weightGrams,
    dimensionsCm: { length: 30, width: 24, height: 10 },
    declaredValue,
    codAmount: order.paymentMethod === 'COD' ? declaredValue : 0,
    events: [
      {
        id: entityId('shev'),
        shipmentId: '',
        status: 'CREATED',
        title: 'Shipment created',
        description: `${shippable.length} item${shippable.length === 1 ? '' : 's'} packed into one parcel.`,
        location: pickup.city,
        providerStatusCode: null,
        occurredAt: iso,
      },
    ],
    createdAt: iso,
    updatedAt: iso,
  };
  shipment.events[0].shipmentId = shipment.id;

  const shipments = await collections.shipments();
  await shipments.insertOne({ _id: shipment.id, ...shipment });

  // Claim the items so a second parcel cannot include them.
  await itemCol.updateMany(
    { _id: { $in: shippable.map((item) => item.id) } },
    { $set: { shipmentId: shipment.id, updatedAt: iso } },
  );

  await sellerOrders.updateOne(
    { _id: sellerOrderId },
    { $addToSet: { shipmentIds: shipment.id }, $set: { updatedAt: iso } },
  );

  return { ok: true, shipmentId: shipment.id };
}

/* ----------------------------------------------------------------- label */

/**
 * Assign a courier and burn an AWB.
 *
 * Idempotent by design: a shipment that already has an AWB returns it rather
 * than requesting a second one. Sellers double-click, and every wasted AWB is
 * a real cost.
 */
export async function generateLabel(
  shipmentId: string,
): Promise<{ ok: boolean; error?: string; awb?: string }> {
  const shipments = await collections.shipments();
  const shipment = toEntity(await shipments.findOne({ _id: shipmentId }));
  if (!shipment) return { ok: false, error: 'Shipment not found.' };
  if (shipment.awb) return { ok: true, awb: shipment.awb };
  if (shipment.status === 'CANCELLED') {
    return { ok: false, error: 'This shipment was cancelled.' };
  }

  const provider = shipping();

  // A parcel whose creation failed at the courier has no provider id; register
  // it now rather than making the seller start over.
  let providerShipmentId = shipment.providerShipmentId;
  if (!providerShipmentId) {
    const retry = await createShipmentForSellerOrder(shipment.sellerOrderId, {
      itemIds: shipment.items.map((item) => item.orderItemId),
    });
    if (!retry.ok) return { ok: false, error: retry.error };
    const refreshed = toEntity(await shipments.findOne({ _id: shipmentId }));
    providerShipmentId = refreshed?.providerShipmentId ?? null;
    if (!providerShipmentId) {
      return { ok: false, error: 'The courier is not reachable right now. Try again shortly.' };
    }
  }

  const invoices = await collections.invoices();
  const invoice = toEntity(await invoices.findOne({ sellerOrderId: shipment.sellerOrderId }));

  const itemCol = await collections.orderItems();
  const items = toEntities(
    await itemCol.find({ _id: { $in: shipment.items.map((item) => item.orderItemId) } }).toArray(),
  );

  try {
    const label = await provider.generateLabel({
      providerShipmentId,
      shipmentNumber: shipment.shipmentNumber,
      weightGrams: shipment.weightGrams,
      dimensionsCm: shipment.dimensionsCm,
      invoiceNumber: invoice?.invoiceNumber ?? shipment.shipmentNumber,
      invoiceDate: invoice?.issuedAt ?? new Date().toISOString(),
      items: items.map((item) => {
        const interState = item.taxBreakup.some((line) => line.igst > 0);
        return {
          orderItemId: item.id,
          taxRatePercent: item.taxRatePercent,
          cgstPercent: interState ? 0 : item.taxRatePercent / 2,
          sgstPercent: interState ? 0 : item.taxRatePercent / 2,
          igstPercent: interState ? item.taxRatePercent : 0,
        };
      }),
    });

    await applyEvent(shipment, {
      status: 'LABEL_GENERATED',
      providerStatusCode: 'packed',
      title: 'Label generated',
      description: `${label.carrier} assigned. AWB ${label.awb}.`,
      location: null,
      occurredAt: new Date().toISOString(),
    });

    await shipments.updateOne(
      { _id: shipmentId },
      {
        $set: {
          awb: label.awb,
          carrier: label.carrier,
          carrierServiceType: label.carrierServiceType,
          labelUrl: label.labelUrl,
          trackingUrl: label.trackingUrl,
          failureReason: null,
          updatedAt: new Date().toISOString(),
        },
      },
    );

    return { ok: true, awb: label.awb };
  } catch (error) {
    if (error instanceof ShippingProviderError) return { ok: false, error: error.message };
    throw error;
  }
}

/* ---------------------------------------------------------------- pickup */

export async function schedulePickup(
  shipmentIds: string[],
  pickupDate: string,
): Promise<{ ok: boolean; error?: string; scheduled: number }> {
  const shipments = await collections.shipments();
  const selected = toEntities(await shipments.find({ _id: { $in: shipmentIds } }).toArray());

  const ready = selected.filter((s) => s.awb && s.status === 'LABEL_GENERATED');
  if (ready.length === 0) {
    return { ok: false, error: 'Generate labels before scheduling a pickup.', scheduled: 0 };
  }

  const locations = await collections.sellerLocations();
  const pickup = toEntity(await locations.findOne({ _id: ready[0].pickupLocationId }));

  try {
    const result = await shipping().schedulePickup({
      providerShipmentIds: ready.map((s) => s.providerShipmentId ?? s.shipmentNumber),
      pickupPincode: pickup?.pincode ?? '560001',
      pickupDate,
    });

    const rejected = new Set(result.rejected.map((row) => row.providerShipmentId));
    let scheduled = 0;

    for (const shipment of ready) {
      if (rejected.has(shipment.providerShipmentId ?? shipment.shipmentNumber)) continue;
      await applyEvent(shipment, {
        status: 'PICKUP_SCHEDULED',
        providerStatusCode: 'ready_to_ship',
        title: 'Pickup scheduled',
        description: `Courier pickup booked for ${new Date(result.scheduledAt).toDateString()}.`,
        location: pickup?.city ?? null,
        occurredAt: new Date().toISOString(),
      });
      await shipments.updateOne(
        { _id: shipment.id },
        { $set: { pickupScheduledAt: result.scheduledAt, updatedAt: new Date().toISOString() } },
      );
      scheduled += 1;
    }

    return { ok: scheduled > 0, scheduled, error: scheduled === 0 ? 'The courier declined every parcel.' : undefined };
  } catch (error) {
    if (error instanceof ShippingProviderError) return { ok: false, error: error.message, scheduled: 0 };
    throw error;
  }
}

/** Hand-over confirmation, used when the seller loads the van themselves. */
export async function markPickedUp(shipmentId: string): Promise<{ ok: boolean; error?: string }> {
  const shipment = await getShipment(shipmentId);
  if (!shipment) return { ok: false, error: 'Shipment not found.' };
  if (!shipment.awb) return { ok: false, error: 'Generate a label first.' };

  await applyEvent(shipment, {
    status: 'PICKED_UP',
    providerStatusCode: 'picked_up',
    title: 'Picked up',
    description: 'The courier has collected the parcel.',
    location: null,
    occurredAt: new Date().toISOString(),
  });

  return { ok: true };
}

/* -------------------------------------------------------------- manifest */

/**
 * A manifest is the handover document: the courier signs one sheet for the
 * whole run rather than scanning each parcel at the door.
 */
export async function createManifest(
  sellerId: string,
  shipmentIds: string[],
): Promise<{ ok: boolean; error?: string; manifestId?: string }> {
  const shipments = await collections.shipments();
  const selected = toEntities(
    await shipments.find({ _id: { $in: shipmentIds }, sellerId }).toArray(),
  );

  const eligible = selected.filter((s) => s.awb && !s.manifestId && s.status !== 'CANCELLED');
  if (eligible.length === 0) {
    return { ok: false, error: 'Select labelled parcels that are not already manifested.' };
  }

  const locations = await collections.sellerLocations();
  const pickup = toEntity(await locations.findOne({ _id: eligible[0].pickupLocationId }));

  const result = await shipping().createManifest(
    eligible.map((s) => s.providerShipmentId ?? s.shipmentNumber),
    pickup?.pincode ?? '560001',
  );

  const iso = new Date().toISOString();
  const manifest: Manifest = {
    id: entityId('mfst'),
    manifestNumber: await nextManifestNumber(),
    sellerId,
    pickupLocationId: eligible[0].pickupLocationId,
    shipmentIds: eligible.map((s) => s.id),
    carrier: eligible[0].carrier ?? 'Eshopbox',
    status: 'CLOSED',
    documentUrl: result.documentUrl || null,
    createdAt: iso,
    closedAt: iso,
  };

  const manifests = await collections.manifests();
  await manifests.insertOne({ _id: manifest.id, ...manifest });

  await shipments.updateMany(
    { _id: { $in: eligible.map((s) => s.id) } },
    { $set: { manifestId: manifest.id, updatedAt: iso } },
  );

  return { ok: true, manifestId: manifest.id };
}

export async function getManifest(manifestId: string): Promise<Manifest | null> {
  const manifests = await collections.manifests();
  return toEntity(await manifests.findOne({ _id: manifestId }));
}

/* ------------------------------------------------------- reverse logistics */

export interface ReturnPickupInput {
  orderId: string;
  sellerOrderId: string;
  sellerId: string;
  items: Array<{ orderItemId: string; quantity: number }>;
  pickupAddress: OrderAddress;
  /** The return or exchange number, sent as the courier's client reference. */
  reference: string;
}

/**
 * Book a courier to collect from the CUSTOMER.
 *
 * The direction is reversed in every sense: the customer's address is the
 * pickup and the seller's is the destination. Marked `RETURN` so the status
 * mapper reads the courier's reverse vocabulary, where "delivered" means the
 * parcel reached the seller rather than the shopper.
 */
export async function createReturnPickup(
  input: ReturnPickupInput,
): Promise<{ ok: boolean; error?: string; shipmentId?: string }> {
  const orders = await collections.orders();
  const order = toEntity(await orders.findOne({ _id: input.orderId }));
  if (!order) return { ok: false, error: 'Order not found.' };

  const locations = await collections.sellerLocations();
  const dropoff = toEntity(
    // Sellers can nominate a different address for returns than for dispatch.
    (await locations.findOne({ sellerId: input.sellerId, isReturnAddress: true })) ??
      (await locations.findOne({ sellerId: input.sellerId })),
  );
  if (!dropoff) return { ok: false, error: 'The seller has no return address configured.' };

  const itemCol = await collections.orderItems();
  const items = toEntities(
    await itemCol.find({ _id: { $in: input.items.map((i) => i.orderItemId) } }).toArray(),
  );
  if (items.length === 0) return { ok: false, error: 'Nothing to collect.' };

  const shipmentNumber = await nextShipmentNumber();
  const iso = new Date().toISOString();
  const provider = shipping();

  const weightGrams = input.items.reduce((sum, line) => sum + 220 * line.quantity, 0);
  const declaredValue = items.reduce((sum, item) => sum + item.lineTotal, 0);

  let providerShipmentId: string | null = null;
  let awb: string | null = null;

  try {
    const created = await provider.createReturnShipment({
      shipmentNumber,
      orderNumber: order.orderNumber,
      sellerOrderNumber: input.reference,
      paymentMode: 'PREPAID',
      codAmount: 0,
      declaredValue,
      weightGrams,
      dimensionsCm: { length: 30, width: 24, height: 10 },
      // Reversed on purpose.
      pickup: {
        name: input.pickupAddress.fullName,
        phone: input.pickupAddress.phone,
        email: null,
        line1: input.pickupAddress.line1,
        line2: input.pickupAddress.line2,
        city: input.pickupAddress.city,
        state: input.pickupAddress.state,
        pincode: input.pickupAddress.pincode,
        country: input.pickupAddress.country,
      },
      delivery: {
        name: dropoff.contactName,
        phone: dropoff.phone,
        email: null,
        line1: dropoff.line1,
        line2: dropoff.line2,
        city: dropoff.city,
        state: dropoff.state,
        pincode: dropoff.pincode,
        country: dropoff.country,
      },
      items: items.map((item) => ({
        orderItemId: item.id,
        sku: item.sku,
        name: item.productTitle,
        quantity: input.items.find((i) => i.orderItemId === item.id)?.quantity ?? 1,
        unitPrice: item.unitSellingPrice,
        discount: 0,
        lineTotal: item.lineTotal,
        taxRatePercent: item.taxRatePercent,
        hsnCode: item.hsnCode,
        weightGrams: 220,
      })),
      expectedShipDate: null,
      promiseDeliveryDate: null,
    });
    providerShipmentId = created.providerShipmentId;
    awb = created.awb;
  } catch (error) {
    if (!(error instanceof ShippingProviderError)) throw error;
    console.error('[vestra:shipping] reverse pickup failed', error);
  }

  const shipment: Shipment = {
    id: entityId('shp'),
    shipmentNumber,
    orderId: order.id,
    orderNumber: order.orderNumber,
    sellerOrderId: input.sellerOrderId,
    sellerId: input.sellerId,
    items: input.items,
    status: 'CREATED',
    direction: 'RETURN',
    provider: provider.name,
    providerShipmentId,
    awb,
    carrier: null,
    carrierServiceType: null,
    trackingUrl: awb ? `/track/${awb}` : null,
    labelUrl: null,
    manifestId: null,
    invoiceId: null,
    pickupLocationId: dropoff.id,
    pickupScheduledAt: null,
    pickedUpAt: null,
    // On a reverse leg this is where the parcel is GOING, i.e. the seller.
    deliveryAddress: {
      id: dropoff.id,
      label: 'OTHER',
      fullName: dropoff.contactName,
      phone: dropoff.phone,
      alternatePhone: null,
      line1: dropoff.line1,
      line2: dropoff.line2,
      landmark: null,
      city: dropoff.city,
      state: dropoff.state,
      pincode: dropoff.pincode,
      country: dropoff.country,
    },
    estimatedDeliveryFrom: null,
    estimatedDeliveryTo: null,
    deliveredAt: null,
    deliveryAttempts: 0,
    failureReason: providerShipmentId ? null : 'Courier unreachable; pickup will be retried.',
    weightGrams,
    dimensionsCm: { length: 30, width: 24, height: 10 },
    declaredValue,
    codAmount: 0,
    events: [
      {
        id: entityId('shev'),
        shipmentId: '',
        status: 'CREATED',
        title: 'Pickup requested',
        description: 'A courier will collect the item from your address.',
        location: input.pickupAddress.city,
        providerStatusCode: null,
        occurredAt: iso,
      },
    ],
    createdAt: iso,
    updatedAt: iso,
  };
  shipment.events[0].shipmentId = shipment.id;

  const shipments = await collections.shipments();
  await shipments.insertOne({ _id: shipment.id, ...shipment });

  return { ok: providerShipmentId !== null, shipmentId: shipment.id };
}

export interface ReplacementShipmentInput {
  exchangeId: string;
  orderId: string;
  sellerOrderId: string;
  sellerId: string;
  orderItemId: string;
  variantId: string;
  quantity: number;
  reference: string;
}

/**
 * Send the replacement out on an exchange.
 *
 * A forward parcel like any other, except it carries a different variant from
 * the one the order item records — so the label and the packing list are built
 * from the REPLACEMENT variant, not the original line.
 */
export async function createReplacementShipment(
  input: ReplacementShipmentInput,
): Promise<{ ok: boolean; error?: string; shipmentId?: string }> {
  const orders = await collections.orders();
  const order = toEntity(await orders.findOne({ _id: input.orderId }));
  if (!order) return { ok: false, error: 'Order not found.' };

  const itemCol = await collections.orderItems();
  const item = toEntity(await itemCol.findOne({ _id: input.orderItemId }));
  if (!item) return { ok: false, error: 'Order item not found.' };

  const products = await collections.products();
  const product = toEntity(await products.findOne({ 'variants.id': input.variantId }));
  const variant = product?.variants.find((v) => v.id === input.variantId);
  if (!variant) return { ok: false, error: 'The replacement variant no longer exists.' };

  const locations = await collections.sellerLocations();
  const pickup = toEntity(
    await locations.findOne({ sellerId: input.sellerId, isPickupEnabled: true }),
  );
  if (!pickup) return { ok: false, error: 'The seller has no pickup address configured.' };

  const shipmentNumber = await nextShipmentNumber();
  const iso = new Date().toISOString();
  const provider = shipping();

  let providerShipmentId: string | null = null;
  try {
    const created = await provider.createShipment({
      shipmentNumber,
      orderNumber: order.orderNumber,
      sellerOrderNumber: input.reference,
      // A replacement is never collected on: the original order already paid.
      paymentMode: 'PREPAID',
      codAmount: 0,
      declaredValue: item.unitSellingPrice * input.quantity,
      weightGrams: 220 * input.quantity,
      dimensionsCm: { length: 30, width: 24, height: 10 },
      pickup: {
        name: pickup.contactName,
        phone: pickup.phone,
        email: null,
        line1: pickup.line1,
        line2: pickup.line2,
        city: pickup.city,
        state: pickup.state,
        pincode: pickup.pincode,
        country: pickup.country,
      },
      delivery: toContact(order.shippingAddress),
      items: [
        {
          orderItemId: item.id,
          sku: variant.sku,
          name: `${item.productTitle} (${variant.size})`,
          quantity: input.quantity,
          unitPrice: item.unitSellingPrice,
          discount: 0,
          lineTotal: item.unitSellingPrice * input.quantity,
          taxRatePercent: item.taxRatePercent,
          hsnCode: item.hsnCode,
          weightGrams: 220,
        },
      ],
      expectedShipDate: iso,
      promiseDeliveryDate: null,
    });
    providerShipmentId = created.providerShipmentId;
  } catch (error) {
    if (!(error instanceof ShippingProviderError)) throw error;
    return { ok: false, error: 'The courier is not reachable right now. Try again shortly.' };
  }

  const shipment: Shipment = {
    id: entityId('shp'),
    shipmentNumber,
    orderId: order.id,
    orderNumber: order.orderNumber,
    sellerOrderId: input.sellerOrderId,
    sellerId: input.sellerId,
    items: [{ orderItemId: input.orderItemId, quantity: input.quantity }],
    status: 'CREATED',
    direction: 'EXCHANGE_FORWARD',
    provider: provider.name,
    providerShipmentId,
    awb: null,
    carrier: null,
    carrierServiceType: null,
    trackingUrl: null,
    labelUrl: null,
    manifestId: null,
    invoiceId: null,
    pickupLocationId: pickup.id,
    pickupScheduledAt: null,
    pickedUpAt: null,
    deliveryAddress: order.shippingAddress,
    estimatedDeliveryFrom: null,
    estimatedDeliveryTo: null,
    deliveredAt: null,
    deliveryAttempts: 0,
    failureReason: null,
    weightGrams: 220 * input.quantity,
    dimensionsCm: { length: 30, width: 24, height: 10 },
    declaredValue: item.unitSellingPrice * input.quantity,
    codAmount: 0,
    events: [
      {
        id: entityId('shev'),
        shipmentId: '',
        status: 'CREATED',
        title: 'Replacement packed',
        description: `Size ${variant.size} is being dispatched.`,
        location: pickup.city,
        providerStatusCode: null,
        occurredAt: iso,
      },
    ],
    createdAt: iso,
    updatedAt: iso,
  };
  shipment.events[0].shipmentId = shipment.id;

  const shipments = await collections.shipments();
  await shipments.insertOne({ _id: shipment.id, ...shipment });

  // Generate the label immediately: the seller already has the parcel in hand,
  // and an exchange replacement should not wait in the "needs label" queue.
  await generateLabel(shipment.id);

  return { ok: true, shipmentId: shipment.id };
}

/* -------------------------------------------------------------- tracking */

/**
 * Apply one courier scan.
 *
 * This is the single write path for shipment status, used by the webhook, by
 * the polling reconciler and by seller actions alike. Everything that makes
 * tracking correct lives here rather than being repeated at each caller:
 * out-of-order scans are dropped, duplicates are ignored, and the items move
 * only through the guarded transition.
 */
export async function applyEvent(
  shipment: Shipment,
  event: TrackingEvent,
): Promise<{ applied: boolean; reason?: string }> {
  if (!shouldAdvance(shipment.status, event.status)) {
    return { applied: false, reason: 'stale-or-duplicate' };
  }

  const shipments = await collections.shipments();
  const iso = new Date().toISOString();

  const record: ShipmentEvent = {
    id: entityId('shev'),
    shipmentId: shipment.id,
    status: event.status,
    title: event.title,
    description: event.description,
    location: event.location,
    providerStatusCode: event.providerStatusCode,
    occurredAt: event.occurredAt,
  };

  const set: Record<string, unknown> = { status: event.status, updatedAt: iso };
  if (event.status === 'PICKED_UP') set.pickedUpAt = event.occurredAt;
  if (event.status === 'DELIVERED') set.deliveredAt = event.occurredAt;
  if (event.status === 'DELIVERY_FAILED') set.failureReason = event.description;

  const update: Record<string, unknown> = { $set: set, $push: { events: record } };
  if (event.status === 'DELIVERY_FAILED') update.$inc = { deliveryAttempts: 1 };

  await shipments.updateOne({ _id: shipment.id }, update);

  /*
   * What a scan MEANS depends on which way the parcel is travelling, and this
   * is the one place that difference is resolved.
   *
   * On a FORWARD leg, the parcel's state is the item's state. On a RETURN leg
   * it is not: "delivered" means the parcel reached the SELLER, and mapping
   * that onto the order item would tell the customer their refund shipment was
   * delivered to them. An EXCHANGE_FORWARD leg carries a replacement, so its
   * delivery closes the exchange rather than the original line.
   */
  if (shipment.direction === 'FORWARD') {
    // `allowForwardSkip` because a courier scan is an OBSERVATION, not a
    // decision: if they never scanned the parcel in transit, the item must
    // still follow it out for delivery rather than stall a step behind.
    const fulfillment = SHIPMENT_TO_FULFILLMENT[event.status];
    if (fulfillment) {
      for (const line of shipment.items) {
        await transitionItem(line.orderItemId, fulfillment, 'COURIER', event.title, {
          allowForwardSkip: true,
        });
      }
    }
    await notifyCustomer(shipment, event);
  } else if (shipment.direction === 'RETURN') {
    await handleReverseArrival(shipment, event);
  } else if (shipment.direction === 'EXCHANGE_FORWARD' && event.status === 'DELIVERED') {
    const { completeExchange } = await import('./exchanges');
    const exchanges = await collections.exchanges();
    const linked = toEntity(await exchanges.findOne({ forwardShipmentId: shipment.id }));
    if (linked) await completeExchange(linked.id);
    await notifyCustomer(shipment, event);
  }

  return { applied: true };
}

/**
 * A reverse parcel reaching the seller is not a delivery to anybody the
 * customer cares about — it is the moment the quality check becomes possible.
 * The seller is told; the customer is told only that we have it.
 */
async function handleReverseArrival(shipment: Shipment, event: TrackingEvent): Promise<void> {
  if (event.status !== 'DELIVERED') return;

  const iso = new Date().toISOString();

  const returns = await collections.returns();
  const request = toEntity(await returns.findOne({ shipmentId: shipment.id }));
  if (request) {
    await returns.updateOne(
      { _id: request.id },
      { $set: { receivedAt: event.occurredAt, updatedAt: iso } },
    );
  }

  const sellers = await collections.sellers();
  const seller = toEntity(await sellers.findOne({ _id: shipment.sellerId }));
  if (seller) {
    const users = await collections.users();
    const owner = await users.findOne({ _id: seller.ownerUserId });
    if (owner) {
      notifyQuietly({
        userId: owner._id,
        category: 'RETURN',
        title: `A returned parcel has arrived`,
        body: `Order ${shipment.orderNumber} is back with you. Record the quality check to release the refund.`,
        href: '/seller/returns',
        entityType: 'shipment',
        entityId: shipment.id,
      });
    }
  }

  const orders = await collections.orders();
  const order = toEntity(await orders.findOne({ _id: shipment.orderId }));
  if (order?.userId) {
    notifyQuietly({
      userId: order.userId,
      category: 'RETURN',
      title: `We have received your return`,
      body: 'The seller is checking the item. Your refund follows once it passes.',
      href: `/orders/${order.id}`,
      entityType: 'shipment',
      entityId: shipment.id,
    });
  }
}

/**
 * Reconcile one shipment against the courier.
 *
 * Webhooks are the authority but they are not guaranteed — an endpoint that was
 * briefly down loses events permanently. Polling is the safety net, run when a
 * seller or the customer opens a tracking view.
 */
export async function syncTracking(shipmentId: string): Promise<{ applied: number }> {
  const shipment = await getShipment(shipmentId);
  if (!shipment?.awb) return { applied: 0 };

  let snapshot;
  try {
    snapshot = await shipping().track(shipment.awb);
  } catch (error) {
    console.error('[vestra:shipping] tracking poll failed', error);
    return { applied: 0 };
  }
  if (!snapshot) return { applied: 0 };

  const seen = new Set(
    shipment.events.map((event) => `${event.status}:${event.occurredAt.slice(0, 16)}`),
  );

  let applied = 0;
  // Re-read between applications: each one moves the shipment forward, and
  // `shouldAdvance` must judge against the current state, not a stale copy.
  let current = shipment;
  for (const event of snapshot.events) {
    if (seen.has(`${event.status}:${event.occurredAt.slice(0, 16)}`)) continue;
    const result = await applyEvent(current, event);
    if (!result.applied) continue;
    applied += 1;
    current = (await getShipment(shipmentId)) ?? current;
  }

  return { applied };
}

/* -------------------------------------------------------------- cancelling */

export async function cancelShipment(
  shipmentId: string,
  reason: string,
): Promise<{ ok: boolean; error?: string }> {
  const shipment = await getShipment(shipmentId);
  if (!shipment) return { ok: false, error: 'Shipment not found.' };
  if (['PICKED_UP', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED'].includes(shipment.status)) {
    return { ok: false, error: 'This parcel is already with the courier and cannot be cancelled.' };
  }

  if (shipment.providerShipmentId) {
    const result = await shipping().cancelShipment(shipment.providerShipmentId, reason);
    if (!result.ok) return { ok: false, error: result.message ?? 'The courier refused the cancellation.' };
  }

  const shipments = await collections.shipments();
  const iso = new Date().toISOString();

  await shipments.updateOne(
    { _id: shipmentId },
    {
      $set: { status: 'CANCELLED', updatedAt: iso, failureReason: reason },
      $push: {
        events: {
          id: entityId('shev'),
          shipmentId,
          status: 'CANCELLED' as ShipmentStatus,
          title: 'Shipment cancelled',
          description: reason,
          location: null,
          providerStatusCode: null,
          occurredAt: iso,
        },
      },
    },
  );

  // Release the items so they can be put into a fresh parcel.
  const itemCol = await collections.orderItems();
  await itemCol.updateMany(
    { _id: { $in: shipment.items.map((item) => item.orderItemId) } },
    { $set: { shipmentId: null, updatedAt: iso } },
  );

  return { ok: true };
}

/* -------------------------------------------------------------- helpers */

function toContact(address: OrderAddress) {
  return {
    name: address.fullName,
    phone: address.phone,
    email: null,
    line1: address.line1,
    line2: address.line2,
    city: address.city,
    state: address.state,
    pincode: address.pincode,
    country: address.country,
  };
}

/**
 * Tell the customer, but only about the scans they would care about. A parcel
 * moving between two sorting hubs is noise; "out for delivery" is not.
 */
const NOTIFIABLE: ShipmentStatus[] = [
  'PICKED_UP',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'DELIVERY_FAILED',
  'RTO_INITIATED',
  'LOST',
];

async function notifyCustomer(shipment: Shipment, event: TrackingEvent): Promise<void> {
  if (!NOTIFIABLE.includes(event.status)) return;

  const orders = await collections.orders();
  const order = toEntity(await orders.findOne({ _id: shipment.orderId }));
  if (!order?.userId) return;

  notifyQuietly({
    userId: order.userId,
    category: 'SHIPPING',
    title: `${order.orderNumber}: ${SHIPMENT_STATUS_META[event.status].label.toLowerCase()}`,
    body: event.description ?? SHIPMENT_STATUS_META[event.status].description,
    href: `/orders/${order.id}`,
    entityType: 'shipment',
    entityId: shipment.id,
  });
}
