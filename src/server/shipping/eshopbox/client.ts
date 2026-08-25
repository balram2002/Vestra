import 'server-only';

import { ShippingProviderError } from '../provider';

/**
 * Eshopbox HTTP transport.
 *
 * Everything awkward about talking to a third-party logistics API lives here so
 * the adapter above can read like business logic:
 *
 *  - ACCESS TOKENS expire after 24h and are minted from a long-lived refresh
 *    token. The token is cached in module scope and refreshed slightly early,
 *    because a token that expires mid-flight fails a shipment that was fine.
 *  - CONCURRENT REFRESH is collapsed into one in-flight promise. Ten parcels
 *    labelled at once must not mint ten tokens and race each other.
 *  - RETRIES apply to timeouts, 429 and 5xx only. Retrying a 4xx just repeats
 *    a rejection, and retrying a non-idempotent write would duplicate parcels.
 *  - TIMEOUTS are mandatory. A courier API that hangs must not hold a seller's
 *    "generate label" click open indefinitely.
 *
 * Docs: https://eshop.gitbook.io/eshopbox-developers
 */

const AUTH_URL = 'https://auth.myeshopbox.com/api/v1/generateToken';
const DEFAULT_WMS_URL = 'https://wms.eshopbox.com';
const REQUEST_TIMEOUT_MS = 15_000;
const MAX_ATTEMPTS = 3;
/** Refresh this long before expiry so an in-flight call cannot age out. */
const TOKEN_SKEW_MS = 5 * 60_000;

export interface EshopboxConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  /** Tenant slug; the serviceability and webhook APIs are per-account hosts. */
  accountSlug: string;
  wmsBaseUrl: string;
  webhookSecret: string | null;
}

/** Reads configuration, or returns null when the integration is not set up. */
export function readConfig(): EshopboxConfig | null {
  const clientId = process.env.ESHOPBOX_CLIENT_ID;
  const clientSecret = process.env.ESHOPBOX_CLIENT_SECRET;
  const refreshToken = process.env.ESHOPBOX_REFRESH_TOKEN;
  const accountSlug = process.env.ESHOPBOX_WORKSPACE;

  if (!clientId || !clientSecret || !refreshToken || !accountSlug) return null;

  return {
    clientId,
    clientSecret,
    refreshToken,
    accountSlug,
    wmsBaseUrl: process.env.ESHOPBOX_BASE_URL || DEFAULT_WMS_URL,
    webhookSecret: process.env.ESHOPBOX_WEBHOOK_SECRET || null,
  };
}

/* ------------------------------------------------------------------ token */

let cachedToken: { value: string; expiresAt: number } | null = null;
let refreshInFlight: Promise<string> | null = null;

async function accessToken(config: EshopboxConfig): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - TOKEN_SKEW_MS > Date.now()) {
    return cachedToken.value;
  }
  // Collapse a stampede: everyone waits on the same refresh.
  refreshInFlight ??= mintToken(config).finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function mintToken(config: EshopboxConfig): Promise<string> {
  const response = await fetch(AUTH_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      grant_type: 'refresh_token',
      refresh_token: config.refreshToken,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    // Credentials must never be cached by the framework's fetch layer.
    cache: 'no-store',
  });

  if (!response.ok) {
    cachedToken = null;
    throw new ShippingProviderError(
      'auth_failed',
      `Eshopbox rejected our credentials (${response.status}). Check ESHOPBOX_CLIENT_ID / SECRET / REFRESH_TOKEN.`,
      response.status >= 500,
    );
  }

  const payload = (await response.json()) as { access_token?: string; expires_in?: number };
  if (!payload.access_token) {
    throw new ShippingProviderError('auth_failed', 'Eshopbox returned no access token.');
  }

  cachedToken = {
    value: payload.access_token,
    expiresAt: Date.now() + (payload.expires_in ?? 86_400) * 1000,
  };
  return cachedToken.value;
}

/** Drop the cached token. Called when the API answers 401 mid-session. */
function invalidateToken(): void {
  cachedToken = null;
}

/* ---------------------------------------------------------------- request */

export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH';
  /** Absolute URL, or a path resolved against the WMS base. */
  path: string;
  body?: unknown;
  /** Per-account host (serviceability, webhooks) instead of the WMS host. */
  useAccountHost?: boolean;
  /** POSTs that create resources must not be retried blindly. */
  idempotent?: boolean;
  query?: Record<string, string | number | undefined>;
}

export async function request<T>(config: EshopboxConfig, options: RequestOptions): Promise<T> {
  const base = options.useAccountHost
    ? `https://${config.accountSlug}.myeshopbox.com`
    : config.wmsBaseUrl;

  const url = new URL(options.path.startsWith('http') ? options.path : `${base}${options.path}`);
  for (const [key, value] of Object.entries(options.query ?? {})) {
    if (value !== undefined) url.searchParams.set(key, String(value));
  }

  const method = options.method ?? 'POST';
  const retryable = options.idempotent ?? method === 'GET';
  let lastError: unknown;

  for (let attempt = 1; attempt <= (retryable ? MAX_ATTEMPTS : 1); attempt++) {
    try {
      const token = await accessToken(config);

      const response = await fetch(url, {
        method,
        headers: {
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
          // Required by the per-account APIs to route to the right tenant.
          ProxyHost: config.accountSlug,
        },
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        cache: 'no-store',
      });

      if (response.status === 401) {
        // Token went stale between mint and use. Refresh once, then give up.
        invalidateToken();
        if (attempt < MAX_ATTEMPTS && retryable) continue;
        throw new ShippingProviderError('unauthorized', 'Eshopbox rejected the access token.');
      }

      if (response.status === 429 || response.status >= 500) {
        lastError = new ShippingProviderError(
          response.status === 429 ? 'rate_limited' : 'provider_unavailable',
          `Eshopbox responded ${response.status}.`,
          true,
        );
        if (retryable && attempt < MAX_ATTEMPTS) {
          await backoff(attempt, response.headers.get('retry-after'));
          continue;
        }
        throw lastError;
      }

      const text = await response.text();
      const payload = text ? safeJson(text) : null;

      if (!response.ok) {
        throw new ShippingProviderError(
          'rejected',
          extractMessage(payload) ?? `Eshopbox rejected the request (${response.status}).`,
        );
      }

      return payload as T;
    } catch (error) {
      lastError = error;
      if (error instanceof ShippingProviderError && !error.retryable) throw error;
      // AbortSignal.timeout surfaces as TimeoutError.
      const isTimeout = error instanceof DOMException && error.name === 'TimeoutError';
      if (!retryable || attempt === MAX_ATTEMPTS) {
        throw isTimeout
          ? new ShippingProviderError('timeout', 'Eshopbox did not respond in time.', true)
          : error;
      }
      await backoff(attempt, null);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new ShippingProviderError('unknown', 'Eshopbox request failed.');
}

function backoff(attempt: number, retryAfter: string | null): Promise<void> {
  const hinted = retryAfter ? Number(retryAfter) * 1000 : NaN;
  // Exponential with jitter, so a fleet of retries does not resynchronise.
  const delay = Number.isFinite(hinted) ? hinted : 2 ** attempt * 250 + Math.random() * 250;
  return new Promise((resolve) => setTimeout(resolve, Math.min(delay, 8_000)));
}

function safeJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return { message: text };
  }
}

function extractMessage(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const record = payload as Record<string, unknown>;
  for (const key of ['message', 'error', 'errorMessage', 'detail']) {
    const value = record[key];
    if (typeof value === 'string' && value.trim()) return value;
  }
  return null;
}

/** Exposed for tests so a suite can start from a known token state. */
export function __resetTokenCache(): void {
  cachedToken = null;
  refreshInFlight = null;
}
