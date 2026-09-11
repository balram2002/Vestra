import 'server-only';

import { createHmac, timingSafeEqual } from 'node:crypto';

import { toRupees } from '@/lib/money';

import {
  type CreateShipmentInput,
  type CreateShipmentResult,
  type GenerateLabelInput,
  type GenerateLabelResult,
  type ManifestResult,
  type ServiceabilityOption,
  type ServiceabilityQuery,
  type ServiceabilityResponse,
  type ShippingContact,
  type ShippingProvider,
  ShippingProviderError,
  type ShippingWebhookEvent,
  type SchedulePickupInput,
  type SchedulePickupResult,
  type TrackingSnapshot,
} from '../provider';
import { type EshopboxConfig, request } from './client';
import { describeStatus, mapProviderStatus } from './status';

/**
 * Eshopbox adapter.
 *
 * Translates between VestraWAB's fulfilment vocabulary and Eshopbox's. Two
 * conversions matter and are easy to get silently wrong:
 *
 *  - MONEY. We hold integer paise; Eshopbox expects rupees as decimals. The
 *    conversion happens here and only here.
 *  - IDENTIFIERS. Our `shipmentNumber` is sent as `customerOrderNumber`, which
 *    is what the provider echoes on every webhook. That is the join key that
 *    lets an inbound scan find our shipment without a lookup table.
 */
export function eshopboxAdapter(config: EshopboxConfig): ShippingProvider {
  return {
    name: 'eshopbox',
    live: true,

    async checkServiceability(query: ServiceabilityQuery): Promise<ServiceabilityResponse> {
      interface ServiceRow {
        type?: string;
        courierName?: string;
        isPickup?: string | number;
        isCOD?: string | number;
        isPrepaid?: string | number;
        etd?: string;
        index?: number;
        zone?: string;
      }

      const payload = await request<{ data?: ServiceRow[]; services?: ServiceRow[] }>(config, {
        path: '/api/v1/checkpincodeserviceability',
        useAccountHost: true,
        idempotent: true,
        body: {
          deliveryPincode: query.deliveryPincode,
          pickupPincode: Number(query.pickupPincode),
          weight: query.weightGrams,
          length: query.dimensionsCm.length,
          breadth: query.dimensionsCm.width,
          height: query.dimensionsCm.height,
          paymentType: query.paymentMode === 'COD' ? 'COD' : 'PREPAID',
          invoiceValue: toRupees(query.declaredValue),
        },
      });

      const rows = payload?.data ?? payload?.services ?? [];
      const wanted = query.paymentMode === 'COD' ? 'isCOD' : 'isPrepaid';

      const options: ServiceabilityOption[] = rows
        // A service with an empty `etd` is listed but not currently running.
        .filter((row) => flag(row[wanted]) && (row.etd ?? '').trim() !== '')
        .map((row) => {
          const { minDays, maxDays } = parseEtd(row.etd ?? '');
          return {
            serviceType: row.type ?? 'Eshopbox Standard',
            carrier: row.courierName ?? null,
            codAvailable: flag(row.isCOD),
            prepaidAvailable: flag(row.isPrepaid),
            reversePickupAvailable: flag(row.isPickup),
            minDays,
            maxDays,
            zone: row.zone ?? null,
            priority: row.index ?? 99,
          };
        })
        .sort((a, b) => a.priority - b.priority);

      return {
        serviceable: options.length > 0,
        options,
        message:
          options.length > 0
            ? null
            : `We do not have a courier serving ${query.deliveryPincode} for this parcel yet.`,
      };
    },

    async createShipment(input: CreateShipmentInput): Promise<CreateShipmentResult> {
      const payload = await request<{ id?: string | number; vendorOrderNumber?: string }>(config, {
        path: '/api/order',
        body: buildOrderPayload(input, config),
        // Not idempotent: a blind retry would register a second parcel.
        idempotent: false,
      });

      const providerShipmentId = String(payload?.id ?? payload?.vendorOrderNumber ?? '').trim();
      if (!providerShipmentId) {
        throw new ShippingProviderError(
          'no_shipment_id',
          'Eshopbox accepted the shipment but returned no identifier.',
        );
      }

      return { providerShipmentId, awb: null, status: 'CREATED' };
    },

    async createReturnShipment(input: CreateShipmentInput): Promise<CreateShipmentResult> {
      const payload = await request<{ id?: string | number; awbNumber?: string }>(config, {
        path: '/api/return',
        body: { ...buildOrderPayload(input, config), returnType: 'CUSTOMER_RETURN' },
        idempotent: false,
      });

      const providerShipmentId = String(payload?.id ?? '').trim();
      if (!providerShipmentId) {
        throw new ShippingProviderError(
          'no_shipment_id',
          'Eshopbox accepted the return but returned no identifier.',
        );
      }

      return { providerShipmentId, awb: payload?.awbNumber ?? null, status: 'CREATED' };
    },

    /**
     * Assigns a courier, burns an AWB and marks the parcel packed. This is the
     * irreversible step, which is why the caller must have already persisted a
     * shipment row to attach the result to.
     */
    async generateLabel(input: GenerateLabelInput): Promise<GenerateLabelResult> {
      await request<{ status?: string }>(config, {
        path: '/api/unicommerce/orders/labels',
        idempotent: false,
        body: {
          boxLength: input.dimensionsCm.length,
          boxWidth: input.dimensionsCm.width,
          boxHeight: input.dimensionsCm.height,
          weight: input.weightGrams / 1000,
          orderItems: input.items.map((item) => ({
            orderItemId: item.orderItemId,
            invoiceNumber: input.invoiceNumber,
            invoiceDate: input.invoiceDate,
            taxRate: item.taxRatePercent,
            centralGstPercentage: item.cgstPercent,
            stateGstPercentage: item.sgstPercent,
            integratedGstPercentage: item.igstPercent,
            compensationCessPercentage: 0,
            unionTerritoryGstPercentage: 0,
          })),
        },
      });

      // The label call confirms packing; the AWB is read back separately.
      const awbPayload = await request<{
        awbNumber?: string;
        courierName?: string;
        shippingLabelUrl?: string;
        trackingUrl?: string;
        serviceType?: string;
      }>(config, {
        method: 'GET',
        path: '/api/unicommerce/orders/awb',
        idempotent: true,
        query: { customerOrderNumber: input.shipmentNumber },
      });

      if (!awbPayload?.awbNumber) {
        throw new ShippingProviderError(
          'awb_unavailable',
          'The label was created but Eshopbox has not allocated an AWB yet. Try again shortly.',
          true,
        );
      }

      return {
        awb: awbPayload.awbNumber,
        carrier: awbPayload.courierName ?? 'Eshopbox',
        carrierServiceType: awbPayload.serviceType ?? null,
        labelUrl: awbPayload.shippingLabelUrl ?? '',
        trackingUrl: awbPayload.trackingUrl ?? trackingUrlFor(awbPayload.awbNumber, config),
      };
    },

    async schedulePickup(input: SchedulePickupInput): Promise<SchedulePickupResult> {
      const payload = await request<{
        pickupId?: string;
        scheduledAt?: string;
        rejected?: Array<{ shipmentId: string; reason: string }>;
      }>(config, {
        path: '/api/unicommerce/orders/dispatch',
        idempotent: false,
        body: {
          shipmentIds: input.providerShipmentIds,
          pickupPincode: input.pickupPincode,
          pickupDate: input.pickupDate,
        },
      });

      return {
        pickupId: payload?.pickupId ?? `pickup-${input.pickupDate}`,
        scheduledAt: payload?.scheduledAt ?? input.pickupDate,
        rejected: (payload?.rejected ?? []).map((row) => ({
          providerShipmentId: row.shipmentId,
          reason: row.reason,
        })),
      };
    },

    async createManifest(providerShipmentIds: string[], pickupPincode: string): Promise<ManifestResult> {
      const payload = await request<{ manifestId?: string; manifestUrl?: string }>(config, {
        path: '/api/unicommerce/orders/manifest',
        idempotent: false,
        body: { shipmentIds: providerShipmentIds, pickupPincode },
      });

      return {
        manifestId: payload?.manifestId ?? '',
        documentUrl: payload?.manifestUrl ?? '',
        shipmentCount: providerShipmentIds.length,
      };
    },

    async track(awb: string): Promise<TrackingSnapshot | null> {
      interface Scan {
        status?: string;
        statusCode?: string;
        remark?: string;
        location?: string;
        timestamp?: string;
        updatedAt?: string;
      }

      const payload = await request<{
        awbNumber?: string;
        courierName?: string;
        expectedDeliveryDate?: string;
        scans?: Scan[];
        history?: Scan[];
      }>(config, {
        method: 'GET',
        path: '/api/v1/tracking',
        useAccountHost: true,
        idempotent: true,
        query: { awb },
      });

      if (!payload) return null;

      const scans = payload.scans ?? payload.history ?? [];
      const events = scans
        .map((scan) => {
          const code = scan.statusCode ?? scan.status ?? '';
          const status = mapProviderStatus(code, 'FORWARD');
          if (!status) return null;
          const copy = describeStatus(status, 'FORWARD');
          return {
            status,
            providerStatusCode: code,
            title: copy.title,
            description: scan.remark ?? copy.description,
            location: scan.location ?? null,
            occurredAt: scan.timestamp ?? scan.updatedAt ?? new Date().toISOString(),
          };
        })
        .filter((event): event is NonNullable<typeof event> => event !== null)
        .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));

      return {
        awb,
        carrier: payload.courierName ?? null,
        status: events.at(-1)?.status ?? 'CREATED',
        estimatedDeliveryTo: payload.expectedDeliveryDate ?? null,
        events,
      };
    },

    async cancelShipment(providerShipmentId: string, reason: string) {
      try {
        await request(config, {
          path: '/api/unicommerce/orders/cancel',
          idempotent: false,
          body: { shipmentId: providerShipmentId, reason },
        });
        return { ok: true, message: null };
      } catch (error) {
        if (error instanceof ShippingProviderError) return { ok: false, message: error.message };
        throw error;
      }
    },

    async parseWebhook(body: string, signature: string | null): Promise<ShippingWebhookEvent> {
      const signatureValid = verifySignature(body, signature, config.webhookSecret);

      let parsed: Record<string, unknown> = {};
      try {
        parsed = JSON.parse(body) as Record<string, unknown>;
      } catch {
        return {
          eventId: `malformed-${Date.now()}`,
          shipmentNumber: null,
          providerShipmentId: null,
          awb: null,
          signatureValid: false,
          event: null,
          raw: body.slice(0, 2000),
        };
      }

      // Eshopbox nests the entity under `data` and the topic alongside it.
      const data = (parsed.data ?? parsed.payload ?? parsed) as Record<string, unknown>;
      const statusCode = String(
        data.shipmentStatus ?? data.status ?? parsed.eventSubType ?? '',
      );
      const direction = String(data.shipmentType ?? '').toLowerCase().includes('return')
        ? ('RETURN' as const)
        : ('FORWARD' as const);

      const status = statusCode ? mapProviderStatus(statusCode, direction) : null;
      const copy = status ? describeStatus(status, direction) : null;

      return {
        eventId: String(parsed.eventId ?? parsed.id ?? `${statusCode}-${data.awbNumber ?? ''}-${data.updatedAt ?? Date.now()}`),
        shipmentNumber: str(data.customerOrderNumber) ?? str(data.clientReferenceNumber),
        providerShipmentId: str(data.shipmentId) ?? str(data.id),
        awb: str(data.awbNumber) ?? str(data.trackingId),
        signatureValid,
        event:
          status && copy
            ? {
                status,
                providerStatusCode: statusCode,
                title: copy.title,
                description: str(data.remark) ?? copy.description,
                location: str(data.location) ?? str(data.city),
                occurredAt: str(data.updatedAt) ?? str(data.timestamp) ?? new Date().toISOString(),
              }
            : null,
        raw: body.slice(0, 4000),
      };
    },
  };
}

/* ------------------------------------------------------------- helpers */

function buildOrderPayload(input: CreateShipmentInput, config: EshopboxConfig) {
  return {
    externalChannelID: config.accountSlug,
    // Echoed back on every webhook: this is our join key.
    customerOrderNumber: input.shipmentNumber,
    orderDate: new Date().toISOString(),
    expectedShipDate: input.expectedShipDate,
    promiseDeliveryDate: input.promiseDeliveryDate,
    isCOD: input.paymentMode === 'COD' ? '1' : '0',
    paymentType: input.paymentMode === 'COD' ? 'COD' : 'Prepaid',
    thirdPartyShipping: false,
    subtotal: toRupees(input.items.reduce((sum, item) => sum + item.lineTotal, 0)),
    orderTotal: toRupees(input.declaredValue),
    balanceDue: toRupees(input.codAmount),
    taxAmount: toRupees(
      input.items.reduce(
        (sum, item) =>
          sum + Math.round((item.lineTotal * item.taxRatePercent) / (100 + item.taxRatePercent)),
        0,
      ),
    ),
    shipChargeAmount: 0,
    shippingAddress: toEshopboxAddress(input.delivery),
    billingAddress: toEshopboxAddress(input.delivery),
    pickupAddress: toEshopboxAddress(input.pickup),
    items: input.items.map((item, index) => ({
      itemID: item.orderItemId,
      lineItemSequenceNumber: index + 1,
      productName: item.name,
      sellerSkuOnChannel: item.sku,
      quantity: item.quantity,
      customerPrice: toRupees(item.unitPrice),
      discount: toRupees(item.discount),
      lineItemTotal: toRupees(item.lineTotal),
      productAdditionalInfo: {
        weight: item.weightGrams,
        taxPercentage: item.taxRatePercent,
        hsnCode: item.hsnCode,
      },
    })),
  };
}

function toEshopboxAddress(contact: ShippingContact) {
  return {
    customerName: contact.name,
    addressLine1: contact.line1,
    addressLine2: contact.line2 ?? '',
    city: contact.city,
    state: contact.state,
    postalCode: contact.pincode,
    contactPhone: contact.phone,
    email: contact.email ?? '',
    countryCode: 'IN',
    countryName: 'India',
    gstin: contact.gstin ?? '',
  };
}

/** Eshopbox reports availability as "1"/"0", occasionally as a real boolean. */
function flag(value: string | number | boolean | undefined): boolean {
  return value === 1 || value === '1' || value === true;
}

/** Eshopbox reports transit time as "2-4 days", "3 days" or a bare number. */
function parseEtd(etd: string): { minDays: number | null; maxDays: number | null } {
  const match = etd.match(/(\d+)\s*(?:-\s*(\d+))?/);
  if (!match) return { minDays: null, maxDays: null };
  const min = Number(match[1]);
  const max = match[2] ? Number(match[2]) : min;
  return { minDays: min, maxDays: max };
}

function trackingUrlFor(awb: string, config: EshopboxConfig): string {
  return `https://${config.accountSlug}.myeshopbox.com/tracking/${awb}`;
}

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value : null;
}

/**
 * HMAC-SHA256 over the raw body, compared in constant time.
 *
 * An unsigned webhook is refused rather than trusted: this endpoint can move a
 * parcel to DELIVERED, which releases the seller's money and starts the return
 * clock. Without a signature it would be an open "mark my order delivered" API.
 */
function verifySignature(body: string, signature: string | null, secret: string | null): boolean {
  if (!secret) {
    // No secret configured means we cannot verify, so we must not pretend to.
    return false;
  }
  if (!signature) return false;

  const expected = createHmac('sha256', secret).update(body, 'utf8').digest('hex');
  const provided = signature.replace(/^sha256=/, '').trim();

  const a = Buffer.from(expected, 'utf8');
  const b = Buffer.from(provided, 'utf8');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
