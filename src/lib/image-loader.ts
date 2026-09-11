'use client';

import { deliveryReady, ikUrl } from './imagekit-url';

/**
 * The `next/image` loader.
 *
 * Registered as `images.loaderFile` in `next.config.ts`, so EVERY `<Image>` in
 * the app resolves through here — product photography, category tiles, avatars,
 * CMS banners. That is what makes "all images are served by ImageKit" true of
 * the whole app rather than of the few components someone remembered to change.
 *
 * A `loaderFile` replaces Next's built-in optimiser rather than sitting beside
 * it, so this has to keep working when ImageKit is not configured. In that case
 * it hands the request back to `/_next/image`, which is exactly what Next would
 * have done on its own — the fallback is the default behaviour, spelled out.
 *
 * Runs in the browser, so it may only read `NEXT_PUBLIC_` values and must stay
 * synchronous and cheap: it is called once per image per breakpoint.
 */
export default function imageLoader({
  src,
  width,
  quality,
}: {
  src: string;
  width: number;
  quality?: number;
}): string {
  if (deliveryReady()) {
    return ikUrl(src, { width, quality: quality ?? 75, crop: 'maintain_ratio' });
  }

  /*
   * No ImageKit. Two cases:
   *
   * A relative path can go to Next's own optimiser. An absolute URL can too,
   * but only if its host is in `remotePatterns` — and an unlisted host makes
   * the optimiser return 400, so those are passed through untouched instead.
   * Serving an unoptimised remote image is worse than optimising it and much
   * better than a broken one.
   */
  if (/^https?:\/\//i.test(src) && !isConfiguredRemoteHost(src)) {
    return src;
  }

  const params = new URLSearchParams({
    url: src,
    w: String(width),
    q: String(quality ?? 75),
  });
  return `/_next/image?${params.toString()}`;
}

/**
 * Hosts listed in `next.config.ts`'s `remotePatterns`.
 *
 * Duplicated here because a loader cannot read the Next config at runtime. Kept
 * to the one list that matters and checked by a test, so the two cannot drift
 * apart silently.
 */
export const OPTIMISABLE_REMOTE_HOSTS = ['images.unsplash.com', 'cdn.vestrawab.example'];

function isConfiguredRemoteHost(src: string): boolean {
  try {
    return OPTIMISABLE_REMOTE_HOSTS.includes(new URL(src).hostname);
  } catch {
    return false;
  }
}
