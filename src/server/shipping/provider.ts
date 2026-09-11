import 'server-only';

import type { ShipmentStatus } from '@/domain/enums';

/**
 * Courier contract.
 *
 * Eshopbox is the provider VestraWAB ships with, but nothing above this file knows
 * that. The service layer speaks in shipments, AWBs and pickups; the adapter
 * translates. Adding a second courier for a region Eshopbox does not cover is
 * then a new implementation of this interface, not a change to fulfilment.
 *
 * The shape follows how logistics actually works rather than a tidy CRUD model:
 *
 *  - `checkServiceability` is asked BEFORE checkout completes, because a
 *    pincode that cannot receive a parcel must not be allowed to place an
 *    order for it.
 *  - `createShipment` registers intent. It does not produce an AWB, because
 *    couriers allocate those at manifest time and allocating early wastes them.
 *  - `generateLabel` is the point of no return: it assigns the courier, burns
 *    an AWB and marks the parcel packed. It is idempotent on our shipment id,
 *    because a double-clicked "Generate label" must not consume two AWBs.
 *  - `track` exists for reconciliation only. The webhook is the authority; a
 *    poll is what you do when the webhook did not arrive.
 */

export interface ServiceabilityQuery {
  pickupPincode: string;
  deliveryPincode: string;
  weightGrams: number;
  dimensionsCm: { length: number; width: number; height: number };
  /** COD needs a courier that can collect cash, which not all can. */
  paymentMode: 'PREPAID' | 'COD';
  declaredValue: number;
}

export interface ServiceabilityOption {
  /** Provider's service name, e.g. "Eshopbox Standard". */
  serviceType: string;
  carrier: string | null;
  codAvailable: boolean;
  prepaidAvailable: boolean;
  reversePickupAvailable: boolean;
  /** Expected transit days. Null when the provider gave no estimate. */
  minDays: number | null;
  maxDays: number | null;
  /** Local | Zonal | Metro | National | Remote. Drives the delivery promise. */
  zone: string | null;
  /** Provider's own ranking; lower is more preferred. */
  priority: number;
}

export interface ServiceabilityResponse {
  serviceable: boolean;
  options: ServiceabilityOption[];
  /** Why nothing is available, when the provider says. */
  message: string | null;
}

export interface CreateShipmentInput {
  /** Our shipment number. Sent as the provider's client reference. */
  shipmentNumber: string;
  orderNumber: string;
  sellerOrderNumber: string;
  paymentMode: 'PREPAID' | 'COD';
  /** Paise. Zero for prepaid. */
  codAmount: number;
  declaredValue: number;
  weightGrams: number;
  dimensionsCm: { length: number; width: number; height: number };
  pickup: ShippingContact;
  delivery: ShippingContact;
  items: ShipmentLineInput[];
  /** ISO date the seller expects to hand over. */
  expectedShipDate: string | null;
  promiseDeliveryDate: string | null;
}

export interface ShippingContact {
  name: string;
  phone: string;
  email: string | null;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  pincode: string;
  country: string;
  gstin?: string | null;
}

export interface ShipmentLineInput {
  /** Our order item id, echoed back on every provider event. */
  orderItemId: string;
  sku: string;
  name: string;
  quantity: number;
  /** Paise. */
  unitPrice: number;
  discount: number;
  lineTotal: number;
  taxRatePercent: number;
  hsnCode: string;
  weightGrams: number;
}

export interface CreateShipmentResult {
  providerShipmentId: string;
  /** Some providers allocate an AWB at creation; most do not. */
  awb: string | null;
  status: ShipmentStatus;
}

export interface GenerateLabelInput {
  providerShipmentId: string;
  shipmentNumber: string;
  weightGrams: number;
  dimensionsCm: { length: number; width: number; height: number };
  invoiceNumber: string;
  invoiceDate: string;
  items: Array<{
    orderItemId: string;
    taxRatePercent: number;
    /** Split so the courier's invoice matches ours exactly. */
    cgstPercent: number;
    sgstPercent: number;
    igstPercent: number;
  }>;
}

export interface GenerateLabelResult {
  awb: string;
  carrier: string;
  carrierServiceType: string | null;
  labelUrl: string;
  trackingUrl: string;
}

export interface SchedulePickupInput {
  providerShipmentIds: string[];
  pickupPincode: string;
  /** ISO date. Providers reject same-day requests past their cutoff. */
  pickupDate: string;
}

export interface SchedulePickupResult {
  pickupId: string;
  scheduledAt: string;
  /** Shipments the provider refused, with the reason. */
  rejected: Array<{ providerShipmentId: string; reason: string }>;
}

export interface ManifestResult {
  manifestId: string;
  documentUrl: string;
  shipmentCount: number;
}

/** One courier scan, normalised. */
export interface TrackingEvent {
  status: ShipmentStatus;
  /** The courier's own status string, kept verbatim for support. */
  providerStatusCode: string;
  title: string;
  description: string | null;
  location: string | null;
  occurredAt: string;
}

export interface TrackingSnapshot {
  awb: string;
  carrier: string | null;
  status: ShipmentStatus;
  estimatedDeliveryTo: string | null;
  events: TrackingEvent[];
}

/** A tracking webhook, reduced to what fulfilment needs. */
export interface ShippingWebhookEvent {
  /** Provider event id; the uniqueness key for replay defence. */
  eventId: string;
  /** Our shipment number, echoed back by the provider. */
  shipmentNumber: string | null;
  providerShipmentId: string | null;
  awb: string | null;
  signatureValid: boolean;
  event: TrackingEvent | null;
  raw: string;
}

export interface ShippingProvider {
  readonly name: 'eshopbox' | 'manual';
  /** True when the adapter is talking to a real API rather than simulating. */
  readonly live: boolean;

  checkServiceability(query: ServiceabilityQuery): Promise<ServiceabilityResponse>;
  createShipment(input: CreateShipmentInput): Promise<CreateShipmentResult>;
  generateLabel(input: GenerateLabelInput): Promise<GenerateLabelResult>;
  schedulePickup(input: SchedulePickupInput): Promise<SchedulePickupResult>;
  createManifest(providerShipmentIds: string[], pickupPincode: string): Promise<ManifestResult>;
  track(awb: string): Promise<TrackingSnapshot | null>;
  cancelShipment(providerShipmentId: string, reason: string): Promise<{ ok: boolean; message: string | null }>;
  /** Reverse pickup for a return or an exchange collection. */
  createReturnShipment(input: CreateShipmentInput): Promise<CreateShipmentResult>;
  parseWebhook(body: string, signature: string | null): Promise<ShippingWebhookEvent>;
}

/** Raised when the courier is reachable but refuses the request. */
export class ShippingProviderError extends Error {
  readonly code: string;
  readonly retryable: boolean;

  constructor(code: string, message: string, retryable = false) {
    super(message);
    this.name = 'ShippingProviderError';
    this.code = code;
    this.retryable = retryable;
  }
}
