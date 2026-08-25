import 'server-only';

import type { ShipmentStatus } from '@/domain/enums';

/**
 * Eshopbox status vocabulary -> Vestra shipment states.
 *
 * The courier's vocabulary is theirs and will change without asking us. Keeping
 * the translation in one table means a new status string is a one-line edit
 * here, and an UNKNOWN one is handled explicitly rather than silently becoming
 * whatever the last branch happened to be.
 *
 * Source: Eshopbox shipper-integration tracking events.
 * https://eshop.gitbook.io/eshopbox-developers/order/shipper-integration-wrapper-api/registering-webhook-for-tracking-shipment
 */

const FORWARD: Record<string, ShipmentStatus> = {
  created: 'CREATED',
  packed: 'LABEL_GENERATED',
  ready_to_ship: 'PICKUP_SCHEDULED',
  picked_up: 'PICKED_UP',
  intransit: 'IN_TRANSIT',
  in_transit: 'IN_TRANSIT',
  reached_hub: 'REACHED_HUB',
  out_for_delivery: 'OUT_FOR_DELIVERY',
  delivered: 'DELIVERED',
  failed_delivery: 'DELIVERY_FAILED',
  shipment_delayed: 'IN_TRANSIT',
  shipment_held: 'IN_TRANSIT',
  rto_created: 'RTO_INITIATED',
  rto_intransit: 'RTO_INITIATED',
  rto_delivered: 'RTO_DELIVERED',
  cancelled_order: 'CANCELLED',
  cancelled: 'CANCELLED',
  damage: 'LOST',
  lost: 'LOST',
};

/**
 * Reverse legs report against a different vocabulary, and two of the strings
 * collide with forward ones while meaning something else entirely: on a return,
 * `delivered` means it reached the SELLER, not the customer.
 */
const REVERSE: Record<string, ShipmentStatus> = {
  created: 'CREATED',
  pickup_pending: 'PICKUP_SCHEDULED',
  picked_up: 'PICKED_UP',
  intransit: 'IN_TRANSIT',
  in_transit: 'IN_TRANSIT',
  delivered_warehouse: 'DELIVERED',
  complete: 'DELIVERED',
  cancelled: 'CANCELLED',
  failed_pickup: 'DELIVERY_FAILED',
  lost: 'LOST',
};

export type ShipmentDirection = 'FORWARD' | 'RETURN' | 'EXCHANGE_FORWARD';

export function mapProviderStatus(
  code: string,
  direction: ShipmentDirection,
): ShipmentStatus | null {
  const key = code.trim().toLowerCase().replace(/[\s-]+/g, '_');
  const table = direction === 'RETURN' ? REVERSE : FORWARD;
  return table[key] ?? null;
}

/**
 * Human copy for a scan. The courier sends terse codes; shoppers read this on
 * the tracking timeline, so the wording is ours, not theirs.
 */
export function describeStatus(
  status: ShipmentStatus,
  direction: ShipmentDirection,
): { title: string; description: string } {
  if (direction === 'RETURN') {
    switch (status) {
      case 'PICKUP_SCHEDULED':
        return {
          title: 'Pickup scheduled',
          description: 'Keep the item packed and ready with its original tags.',
        };
      case 'PICKED_UP':
        return { title: 'Picked up', description: 'The courier has collected your return.' };
      case 'IN_TRANSIT':
        return { title: 'On its way back', description: 'Your return is travelling to the seller.' };
      case 'DELIVERED':
        return {
          title: 'Received by seller',
          description: 'The seller has your item and will run a quality check.',
        };
      case 'DELIVERY_FAILED':
        return {
          title: 'Pickup failed',
          description: 'The courier could not collect the item. We will try again.',
        };
      default:
        break;
    }
  }

  switch (status) {
    case 'CREATED':
      return { title: 'Shipment created', description: 'The seller has registered your parcel.' };
    case 'LABEL_GENERATED':
      return { title: 'Packed', description: 'Your parcel is packed and labelled.' };
    case 'PICKUP_SCHEDULED':
      return { title: 'Pickup scheduled', description: 'A courier will collect it from the seller.' };
    case 'PICKED_UP':
      return { title: 'Picked up', description: 'The courier has your parcel.' };
    case 'IN_TRANSIT':
      return { title: 'In transit', description: 'Your parcel is moving between hubs.' };
    case 'REACHED_HUB':
      return { title: 'Reached your city', description: 'Your parcel is at the local hub.' };
    case 'OUT_FOR_DELIVERY':
      return { title: 'Out for delivery', description: 'Arriving today. Keep your phone reachable.' };
    case 'DELIVERED':
      return { title: 'Delivered', description: 'Your parcel has been delivered.' };
    case 'DELIVERY_FAILED':
      return {
        title: 'Delivery attempt failed',
        description: 'The courier could not deliver. They will try again.',
      };
    case 'RTO_INITIATED':
      return {
        title: 'Returning to seller',
        description: 'After failed attempts the parcel is going back to the seller.',
      };
    case 'RTO_DELIVERED':
      return { title: 'Returned to seller', description: 'The parcel is back with the seller.' };
    case 'CANCELLED':
      return { title: 'Shipment cancelled', description: 'This shipment was cancelled.' };
    case 'LOST':
      return {
        title: 'Reported lost',
        description: 'The courier has reported the parcel lost. We will make it right.',
      };
    default:
      return { title: 'Update', description: 'Your parcel status changed.' };
  }
}

/**
 * Scans that must never move a shipment backwards. Couriers redeliver events
 * out of order surprisingly often, and a stale `intransit` arriving after
 * `delivered` would otherwise un-deliver a parcel in front of the customer.
 */
const PROGRESSION: ShipmentStatus[] = [
  'CREATED',
  'LABEL_GENERATED',
  'PICKUP_SCHEDULED',
  'PICKED_UP',
  'IN_TRANSIT',
  'REACHED_HUB',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
];

/** Terminal states that no later scan may overwrite. */
const TERMINAL: ShipmentStatus[] = ['DELIVERED', 'RTO_DELIVERED', 'CANCELLED', 'LOST'];

export function shouldAdvance(current: ShipmentStatus, incoming: ShipmentStatus): boolean {
  if (current === incoming) return false;
  if (TERMINAL.includes(current)) return false;

  // Exception states (failed delivery, RTO, lost) are always newsworthy, wherever
  // the parcel had got to.
  if (!PROGRESSION.includes(incoming)) return true;

  const currentIndex = PROGRESSION.indexOf(current);
  const incomingIndex = PROGRESSION.indexOf(incoming);
  if (currentIndex === -1) return true;
  return incomingIndex > currentIndex;
}
