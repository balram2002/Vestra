import 'server-only';

import { eshopboxAdapter } from './eshopbox/adapter';
import { readConfig } from './eshopbox/client';
import type { ShippingProvider } from './provider';
import { simulationProvider } from './simulation';

/**
 * Courier selection.
 *
 * One place decides which provider is live. The rule is deliberate: a real
 * provider with missing credentials falls back to simulation and says so
 * loudly, rather than failing every shipment at the moment a seller clicks
 * "generate label". A misconfigured integration that silently breaks
 * fulfilment is a worse outcome than an obviously simulated one.
 */
let warned = false;

export function shipping(): ShippingProvider {
  const configured = process.env.SHIPPING_PROVIDER ?? 'eshopbox';

  if (configured !== 'eshopbox') return simulationProvider();

  // An explicit opt-in to simulation, used in CI and local development.
  if (process.env.ESHOPBOX_MODE === 'simulation') return simulationProvider();

  const config = readConfig();
  if (!config) {
    if (!warned) {
      warned = true;
      console.warn(
        '[vestra:shipping] Eshopbox credentials are not configured ' +
          '(ESHOPBOX_CLIENT_ID / _CLIENT_SECRET / _REFRESH_TOKEN / _WORKSPACE). ' +
          'Running the simulated courier instead.',
      );
    }
    return simulationProvider();
  }

  return eshopboxAdapter(config);
}

export type {
  CreateShipmentInput,
  CreateShipmentResult,
  GenerateLabelInput,
  GenerateLabelResult,
  ManifestResult,
  ServiceabilityOption,
  ServiceabilityQuery,
  ServiceabilityResponse,
  ShippingProvider,
  ShippingWebhookEvent,
  TrackingEvent,
  TrackingSnapshot,
} from './provider';
export { ShippingProviderError } from './provider';
