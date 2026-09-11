'use client';

import { ikServes, ikUrl } from './imagekit-url';

/**
 * The `next/image` loader.
 *
 * Registered as `images.loaderFile` in `next.config.ts`, so EVERY `<Image>` in
 * the app resolves through here: product photography, category tiles, banners,
 * avatars, brand marks.
 *
 * It never sends anything to `/_next/image`. With a custom loader set, a host
 * such as Vercel does not provision Next's own optimiser at all, so a fallback
 * to it is a fallback to a 404 in production. Each source goes to something
 * that can really resize it instead:
 *
 *   1. An ImageKit upload, or any remote image when ImageKit's web proxy is
 *      switched on: ImageKit, with the transformation in the path.
 *   2. Unsplash photography (the category tiles and the default hero slides):
 *      Unsplash's own image CDN, which takes width and quality as parameters.
 *   3. Anything else, a path this app serves (`/api/media/...`, generated SVG)
 *      or a link pasted from another host: the source as it is. An image at its
 *      own size is slower than a resized one, and far better than a broken one.
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
  const q = quality ?? 75;

  if (ikServes(src)) {
    return ikUrl(src, { width, quality: q, crop: 'maintain_ratio' });
  }

  if (isUnsplash(src)) return unsplashUrl(src, width, q);

  return src;
}

const UNSPLASH_HOST = 'images.unsplash.com';

function isUnsplash(src: string): boolean {
  try {
    return new URL(src).hostname === UNSPLASH_HOST;
  } catch {
    return false;
  }
}

/**
 * An Unsplash photograph at one width.
 *
 * The stored URL often fixes a height as well, to crop to an aspect ratio, so
 * the height is scaled with the width: changing one without the other would
 * re-crop the picture at every breakpoint.
 */
export function unsplashUrl(src: string, width: number, quality: number): string {
  const url = new URL(src);
  const storedWidth = Number(url.searchParams.get('w'));
  const storedHeight = Number(url.searchParams.get('h'));

  if (storedWidth > 0 && storedHeight > 0) {
    url.searchParams.set('h', String(Math.round((storedHeight * width) / storedWidth)));
  }
  url.searchParams.set('w', String(Math.round(width)));
  url.searchParams.set('q', String(quality));
  url.searchParams.set('auto', 'format');
  return url.toString();
}
