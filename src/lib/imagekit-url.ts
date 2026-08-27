/**
 * ImageKit URL building.
 *
 * Client-safe: reads only the two `NEXT_PUBLIC_` values, and is imported by the
 * `next/image` loader, which runs in the browser.
 *
 * ImageKit expresses transformations as a path segment — `tr:w-800,q-80` —
 * rather than a query string, which is what lets its CDN treat each derivative
 * as its own cacheable object.
 *
 * Three kinds of source have to be handled, because a marketplace has all
 * three at once:
 *
 *   1. Already an ImageKit URL — an uploaded file. Insert the transformation.
 *   2. Some other absolute URL — seeded photography, a remote asset. ImageKit
 *      fetches it through its web-proxy origin, so it is still delivered,
 *      optimised and cached by ImageKit rather than hot-linked.
 *   3. A path on this app — `/api/media/...`, a local placeholder. ImageKit
 *      cannot reach a localhost path, so these are left alone.
 */

const URL_ENDPOINT = (process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT ?? '').replace(/\/+$/, '');
const PUBLIC_KEY = process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY ?? '';

export function deliveryReady(): boolean {
  return Boolean(URL_ENDPOINT && PUBLIC_KEY);
}

export interface Transform {
  width?: number;
  height?: number;
  quality?: number;
  /** `maintain_ratio` keeps the aspect and fits inside the box. */
  crop?: 'maintain_ratio' | 'at_max' | 'force';
  /** `auto` lets ImageKit pick AVIF or WebP per browser. */
  format?: 'auto' | 'webp' | 'avif' | 'jpg' | 'png';
  /** Blur radius, for a placeholder. */
  blur?: number;
}

function encode(transform: Transform): string {
  const parts: string[] = [];
  if (transform.width) parts.push(`w-${Math.round(transform.width)}`);
  if (transform.height) parts.push(`h-${Math.round(transform.height)}`);
  if (transform.crop) parts.push(`c-${transform.crop}`);
  if (transform.quality) parts.push(`q-${Math.round(transform.quality)}`);
  if (transform.blur) parts.push(`bl-${Math.round(transform.blur)}`);
  // Default to `f-auto` so every browser gets the best format it supports.
  parts.push(`f-${transform.format ?? 'auto'}`);
  return parts.join(',');
}

/**
 * The delivery URL for one source at one size.
 *
 * Returns `src` unchanged when ImageKit is not configured, or when the source
 * is a path this app serves itself — both of which are normal states, not
 * errors, so neither warns.
 */
export function ikUrl(src: string, transform: Transform = {}): string {
  if (!src) return src;
  if (!deliveryReady()) return src;

  const tr = encode(transform);

  // 1. Already ours: /<path> becomes /tr:<transform>/<path>.
  if (src.startsWith(`${URL_ENDPOINT}/`)) {
    const filePath = src.slice(URL_ENDPOINT.length + 1);
    // A URL that already carries a transformation is left alone rather than
    // stacked, which would silently double-resize.
    if (filePath.startsWith('tr:')) return src;
    return `${URL_ENDPOINT}/tr:${tr}/${filePath}`;
  }

  // 2. Remote: delivered through the web-proxy origin.
  if (/^https?:\/\//i.test(src)) {
    return `${URL_ENDPOINT}/tr:${tr}/${src}`;
  }

  // 3. A path on this app. ImageKit cannot fetch it; serve it ourselves.
  return src;
}

/**
 * A tiny, heavily blurred version, for use as a `blurDataURL` source.
 *
 * Cheap enough to request eagerly and small enough that it arrives before the
 * real image starts painting.
 */
export function ikPlaceholder(src: string): string | null {
  if (!deliveryReady()) return null;
  if (!/^https?:\/\//i.test(src)) return null;
  return ikUrl(src, { width: 24, quality: 30, blur: 12 });
}
