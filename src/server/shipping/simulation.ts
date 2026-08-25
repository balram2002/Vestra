import 'server-only';

import { createHmac } from 'node:crypto';

import { METRO_PINCODE_PREFIXES, SHIPPING } from '@/config/business';
import { hashString } from '@/lib/random';

import {
  type CreateShipmentInput,
  type CreateShipmentResult,
  type GenerateLabelInput,
  type GenerateLabelResult,
  type ManifestResult,
  type ServiceabilityQuery,
  type ServiceabilityResponse,
  type ShippingProvider,
  type ShippingWebhookEvent,
  type SchedulePickupInput,
  type SchedulePickupResult,
  type TrackingEvent,
  type TrackingSnapshot,
} from './provider';
import { describeStatus, mapProviderStatus } from './eshopbox/status';

/**
 * Simulated courier.
 *
 * Used when Eshopbox credentials are absent, which is every environment that is
 * not production. It implements the same interface, so fulfilment code takes no
 * branch — and it deliberately behaves like a real courier rather than an
 * always-succeeds stub:
 *
 *  - some pincodes are not serviceable at all, and some are prepaid-only;
 *  - transit time varies by zone;
 *  - roughly one parcel in sixteen fails a delivery attempt before arriving,
 *    and one in fifty goes RTO.
 *
 * Those cases are the ones with the most fragile UI, and a stub that never
 * produces them means they ship untested.
 *
 * TIME, not a background job, drives progress. The projected scan history is
 * derived from the moment the AWB was issued, and `track` returns the scans
 * whose timestamps have passed. That needs no cron and stays correct across
 * restarts, because the issue time is encoded in the AWB itself.
 */

const CARRIERS = ['Bluedart', 'Delhivery', 'Ekart', 'XpressBees', 'Shadowfax'] as const;

export function simulationProvider(): ShippingProvider {
  return {
    name: 'eshopbox',
    live: false,

    async checkServiceability(query: ServiceabilityQuery): Promise<ServiceabilityResponse> {
      const profile = pincodeProfile(query.deliveryPincode);

      if (!profile.serviceable) {
        return {
          serviceable: false,
          options: [],
          message: `We do not deliver to ${query.deliveryPincode} yet. Try a nearby pincode.`,
        };
      }

      if (query.paymentMode === 'COD' && !profile.cod) {
        return {
          serviceable: false,
          options: [],
          message: 'Cash on delivery is not available for this pincode. Prepaid orders are.',
        };
      }

      // Parcels over 5kg drop the express option, as they would in reality.
      const heavy = query.weightGrams > 5000;

      const options = [
        {
          serviceType: 'Eshopbox Standard',
          carrier: profile.carrier,
          codAvailable: profile.cod,
          prepaidAvailable: true,
          reversePickupAvailable: profile.reverse,
          minDays: profile.standardDays.min,
          maxDays: profile.standardDays.max,
          zone: profile.zoneName,
          priority: 1,
        },
      ];

      if (!heavy && profile.zone <= 1) {
        options.unshift({
          serviceType: 'Eshopbox Express',
          carrier: profile.carrier,
          codAvailable: profile.cod,
          prepaidAvailable: true,
          reversePickupAvailable: profile.reverse,
          minDays: SHIPPING.expressDays.min,
          maxDays: SHIPPING.expressDays.max,
          zone: profile.zoneName,
          priority: 0,
        });
      }

      return { serviceable: true, options, message: null };
    },

    async createShipment(input: CreateShipmentInput): Promise<CreateShipmentResult> {
      return {
        providerShipmentId: `esb_${hashString(input.shipmentNumber).toString(36)}`,
        awb: null,
        status: 'CREATED',
      };
    },

    async createReturnShipment(input: CreateShipmentInput): Promise<CreateShipmentResult> {
      return {
        providerShipmentId: `esbr_${hashString(input.shipmentNumber).toString(36)}`,
        awb: issueAwb(input.delivery.pincode),
        status: 'CREATED',
      };
    },

    async generateLabel(input: GenerateLabelInput): Promise<GenerateLabelResult> {
      const awb = issueAwb(input.shipmentNumber);
      const carrier = CARRIERS[hashString(input.shipmentNumber) % CARRIERS.length];
      return {
        awb,
        carrier,
        carrierServiceType: 'Eshopbox Standard',
        // The label is rendered by our own print route rather than fetched.
        labelUrl: `/seller/shipments/${input.shipmentNumber}/label`,
        trackingUrl: `/track/${awb}`,
      };
    },

    async schedulePickup(input: SchedulePickupInput): Promise<SchedulePickupResult> {
      return {
        pickupId: `pk_${hashString(input.providerShipmentIds.join(',')).toString(36)}`,
        scheduledAt: input.pickupDate,
        rejected: [],
      };
    },

    async createManifest(providerShipmentIds: string[]): Promise<ManifestResult> {
      const manifestId = `mf_${hashString(providerShipmentIds.join(',')).toString(36)}`;
      return {
        manifestId,
        documentUrl: `/seller/shipments/manifest/${manifestId}`,
        shipmentCount: providerShipmentIds.length,
      };
    },

    async track(awb: string): Promise<TrackingSnapshot | null> {
      const decoded = decodeAwb(awb);
      if (!decoded) return null;

      const events = projectScans(awb, decoded.issuedAt, decoded.zone).filter(
        (scan) => new Date(scan.occurredAt).getTime() <= Date.now(),
      );

      const zone = ZONES[decoded.zone];
      return {
        awb,
        carrier: CARRIERS[hashString(awb) % CARRIERS.length],
        status: events.at(-1)?.status ?? 'LABEL_GENERATED',
        estimatedDeliveryTo: new Date(
          decoded.issuedAt + zone.hours.delivered * 3_600_000,
        ).toISOString(),
        events,
      };
    },

    async cancelShipment() {
      return { ok: true, message: null };
    },

    async parseWebhook(body: string, signature: string | null): Promise<ShippingWebhookEvent> {
      // The simulator signs with the same secret it verifies, so the webhook
      // route's signature check is genuinely exercised rather than bypassed.
      const secret = process.env.ESHOPBOX_WEBHOOK_SECRET || 'vestra-simulation-secret';
      const expected = createHmac('sha256', secret).update(body, 'utf8').digest('hex');
      const signatureValid = (signature ?? '').replace(/^sha256=/, '') === expected;

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

      const statusCode = String(parsed.status ?? '');
      const direction = String(parsed.shipmentType ?? '')
        .toLowerCase()
        .includes('return')
        ? ('RETURN' as const)
        : ('FORWARD' as const);
      const status = mapProviderStatus(statusCode, direction);
      const copy = status ? describeStatus(status, direction) : null;

      return {
        eventId: String(parsed.eventId ?? `${statusCode}-${parsed.awbNumber}-${parsed.occurredAt}`),
        shipmentNumber: typeof parsed.customerOrderNumber === 'string' ? parsed.customerOrderNumber : null,
        providerShipmentId: typeof parsed.shipmentId === 'string' ? parsed.shipmentId : null,
        awb: typeof parsed.awbNumber === 'string' ? parsed.awbNumber : null,
        signatureValid,
        event:
          status && copy
            ? {
                status,
                providerStatusCode: statusCode,
                title: copy.title,
                description: copy.description,
                location: typeof parsed.location === 'string' ? parsed.location : null,
                occurredAt:
                  typeof parsed.occurredAt === 'string' ? parsed.occurredAt : new Date().toISOString(),
              }
            : null,
        raw: body.slice(0, 4000),
      };
    },
  };
}

/* ---------------------------------------------------------------- pincode */

interface PincodeProfile {
  serviceable: boolean;
  cod: boolean;
  reverse: boolean;
  zone: number;
  zoneName: string;
  carrier: string;
  standardDays: { min: number; max: number };
}

const ZONES = [
  { name: 'Metro', hours: { picked: 5, transit: 14, hub: 24, ofd: 32, delivered: 36 } },
  { name: 'Zonal', hours: { picked: 6, transit: 22, hub: 44, ofd: 56, delivered: 62 } },
  { name: 'National', hours: { picked: 8, transit: 34, hub: 76, ofd: 92, delivered: 100 } },
  { name: 'Remote', hours: { picked: 12, transit: 52, hub: 122, ofd: 146, delivered: 158 } },
];

/**
 * A pincode's delivery characteristics, derived deterministically so the same
 * pincode always behaves the same way — a demo where 560001 is serviceable on
 * one page load and not on the next is worse than no demo.
 */
export function pincodeProfile(pincode: string): PincodeProfile {
  const digits = pincode.replace(/\D/g, '');
  const seed = hashString(`pincode:${digits}`);

  const isMetro = METRO_PINCODE_PREFIXES.some((prefix) => digits.startsWith(prefix));
  const zone = isMetro ? 0 : (seed % 100) < 55 ? 1 : (seed % 100) < 90 ? 2 : 3;

  return {
    // ~4% of non-metro pincodes are genuinely unserved.
    serviceable: isMetro || seed % 25 !== 0,
    cod: seed % 11 !== 0,
    reverse: zone <= 2,
    zone,
    zoneName: ZONES[zone].name,
    carrier: CARRIERS[seed % CARRIERS.length],
    standardDays: isMetro
      ? SHIPPING.metroDays
      : zone === 3
        ? { min: SHIPPING.standardDays.max, max: SHIPPING.standardDays.max + 3 }
        : SHIPPING.standardDays,
  };
}

/* -------------------------------------------------------------------- AWB */

/**
 * A 12-digit AWB that carries its own issue time and zone.
 *
 * Real courier AWBs encode routing information for exactly this reason. Here it
 * means `track` is a pure function of the number: no server-side map to keep,
 * and tracking still works after a restart or on a second instance.
 *
 * Layout: MMMMMMMM Z RR C
 *   MMMMMMMM  minutes since epoch
 *   Z         zone index 0-3
 *   RR        deterministic filler
 *   C         mod-10 check digit
 */
function issueAwb(key: string): string {
  return issueAwbAt(key, new Date());
}

/**
 * Issue an AWB as though it were allocated at `at`.
 *
 * Exported for the seeder, which backfills parcels for historical orders. A
 * demo order placed three weeks ago needs an AWB whose encoded issue time
 * matches, otherwise a tracking refresh would replay its journey from today.
 */
export function issueAwbAt(key: string, at: Date): string {
  const minutes = Math.floor(at.getTime() / 60_000);
  const seed = hashString(key);

  /*
   * The zone and the filler must be drawn from INDEPENDENT parts of the hash.
   * Taking both from the low end (`seed % 4` alongside `seed % 100`) makes the
   * zone a function of the filler, because 4 divides 100 — which silently
   * collapses 400 possible suffixes to 100 and produces duplicate AWBs for
   * parcels issued in the same minute. The seeder's unique index caught it.
   */
  const zone = (seed >>> 16) % 4;
  const filler = seed % 100;

  const base = `${String(minutes).padStart(8, '0')}${zone}${String(filler).padStart(2, '0')}`;
  return base + checkDigit(base);
}

function decodeAwb(awb: string): { issuedAt: number; zone: number } | null {
  const digits = awb.replace(/\D/g, '');
  if (digits.length !== 12) return null;
  if (checkDigit(digits.slice(0, 11)) !== digits[11]) return null;

  const minutes = Number(digits.slice(0, 8));
  const zone = Number(digits[8]);
  if (!Number.isFinite(minutes) || zone > 3) return null;

  return { issuedAt: minutes * 60_000, zone };
}

function checkDigit(base: string): string {
  let sum = 0;
  for (let i = 0; i < base.length; i++) sum += Number(base[i]) * (i % 2 === 0 ? 1 : 3);
  return String((10 - (sum % 10)) % 10);
}

/* ------------------------------------------------------------- projection */

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

/**
 * The scan history a courier would produce for this parcel. Deterministic in
 * the AWB, so every caller sees the same story.
 */
function projectScans(awb: string, issuedAt: number, zone: number): TrackingEvent[] {
  const seed = hashString(awb);
  const timing = ZONES[zone].hours;
  const hub = HUBS[seed % HUBS.length];
  const origin = HUBS[(seed >> 3) % HUBS.length];

  const at = (hours: number) => new Date(issuedAt + hours * 3_600_000).toISOString();

  const scan = (
    status: TrackingEvent['status'],
    code: string,
    hours: number,
    location: string | null,
    override?: string,
  ): TrackingEvent => {
    const copy = describeStatus(status, 'FORWARD');
    return {
      status,
      providerStatusCode: code,
      title: copy.title,
      description: override ?? copy.description,
      location,
      occurredAt: at(hours),
    };
  };

  const events: TrackingEvent[] = [
    scan('LABEL_GENERATED', 'packed', 0, origin),
    scan('PICKUP_SCHEDULED', 'ready_to_ship', 1, origin),
    scan('PICKED_UP', 'picked_up', timing.picked, origin),
    scan('IN_TRANSIT', 'intransit', timing.transit, origin),
    scan('REACHED_HUB', 'reached_hub', timing.hub, hub),
  ];

  // 1 in 50 never arrives and goes back to the seller.
  if (seed % 50 === 0) {
    events.push(
      scan('OUT_FOR_DELIVERY', 'out_for_delivery', timing.ofd, hub),
      scan(
        'DELIVERY_FAILED',
        'failed_delivery',
        timing.ofd + 3,
        hub,
        'Customer was unreachable at the address.',
      ),
      scan('DELIVERY_FAILED', 'failed_delivery', timing.ofd + 27, hub, 'Second attempt unsuccessful.'),
      scan('RTO_INITIATED', 'rto_created', timing.ofd + 51, hub),
      scan('RTO_DELIVERED', 'rto_delivered', timing.delivered + 96, origin),
    );
    return events;
  }

  // 1 in 16 needs a second attempt.
  if (seed % 16 === 0) {
    events.push(
      scan('OUT_FOR_DELIVERY', 'out_for_delivery', timing.ofd, hub),
      scan(
        'DELIVERY_FAILED',
        'failed_delivery',
        timing.ofd + 4,
        hub,
        'Delivery attempted; nobody available to receive.',
      ),
      scan('OUT_FOR_DELIVERY', 'out_for_delivery', timing.ofd + 24, hub),
      scan('DELIVERED', 'delivered', timing.delivered + 24, hub),
    );
    return events;
  }

  events.push(
    scan('OUT_FOR_DELIVERY', 'out_for_delivery', timing.ofd, hub),
    scan('DELIVERED', 'delivered', timing.delivered, hub),
  );
  return events;
}
