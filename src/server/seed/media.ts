import { COLOR_BY_VALUE } from '@/domain/attributes';
import { slugify } from '@/lib/slug';

/**
 * Product imagery.
 *
 * A demo catalogue needs several thousand distinct images. Shipping binaries
 * would bloat the repository, and hotlinking a stock library would make the
 * shop depend on someone else's CDN staying up.
 *
 * Instead each image is generated on request as an SVG by `/api/media`, from a
 * spec encoded in the URL. That gives:
 *
 *   - a stable URL per variant, so `next/image` and the browser cache both work
 *     exactly as they would with real photography;
 *   - imagery that actually reflects the product's colour and silhouette, so
 *     colour swatches and the gallery are not lying;
 *   - immutable caching (see the header rule in `next.config.ts`), because a
 *     given spec always renders the same bytes.
 *
 * Swapping in real photography later means changing this file and nothing else:
 * every consumer only ever sees a URL string.
 */

export type MediaShape =
  | 'kurta'
  | 'saree'
  | 'lehenga'
  | 'dress'
  | 'top'
  | 'shirt'
  | 'tshirt'
  | 'jeans'
  | 'jacket'
  | 'shoe'
  | 'sneaker'
  | 'bag'
  | 'jewellery'
  | 'bottle'
  | 'linen'
  | 'generic';

/** Map a garment name onto the silhouette the renderer knows how to draw. */
export function shapeForGarment(garment: string): MediaShape {
  const g = garment.toLowerCase();
  if (g.includes('saree')) return 'saree';
  if (g.includes('lehenga')) return 'lehenga';
  if (g.includes('kurta') || g.includes('dupatta')) return 'kurta';
  if (g.includes('dress') || g.includes('romper')) return 'dress';
  if (g.includes('co-ord') || g.includes('top')) return 'top';
  if (g.includes('shirt') && !g.includes('t-shirt')) return 'shirt';
  if (g.includes('t-shirt') || g.includes('sweatshirt')) return 'tshirt';
  if (g.includes('jean') || g.includes('chino') || g.includes('trouser')) return 'jeans';
  if (g.includes('jacket')) return 'jacket';
  if (g.includes('sneaker')) return 'sneaker';
  if (g.includes('shoe') || g.includes('jutti') || g.includes('heel')) return 'shoe';
  if (g.includes('bag') || g.includes('backpack') || g.includes('wallet')) return 'bag';
  if (g.includes('earring') || g.includes('jewel')) return 'jewellery';
  if (g.includes('serum') || g.includes('parfum') || g.includes('fragrance')) return 'bottle';
  if (g.includes('bedsheet') || g.includes('cushion')) return 'linen';
  return 'generic';
}

export interface MediaSpec {
  shape: MediaShape;
  /** Colour token from `domain/attributes`. */
  color: string;
  /** Which angle of the product: 0 is the primary shot. */
  view: number;
  /** Distinguishes two products that share shape and colour. */
  key: string;
}

/**
 * Build the URL for a product image.
 *
 * Path-based rather than query-based so it matches the immutable cache rule in
 * `next.config.ts` and so a CDN treats each image as a distinct object.
 */
export function mediaUrl(spec: MediaSpec): string {
  const color = spec.color || 'bone';
  return `/api/media/p/${spec.shape}/${color}/${spec.view}/${slugify(spec.key) || 'v'}.svg`;
}

/** Parse a URL built by `mediaUrl`. Used by the route handler. */
export function parseMediaPath(segments: string[]): MediaSpec | null {
  if (segments.length < 4) return null;
  const [shape, color, view, rest] = segments;
  if (!shape || !color || !rest) return null;

  return {
    shape: shape as MediaShape,
    color,
    view: Number.parseInt(view ?? '0', 10) || 0,
    key: rest.replace(/\.svg$/, ''),
  };
}

/** Non-product imagery: category tiles, brand logos, banners, avatars. */
export function tileUrl(kind: string, key: string, color = 'mulberry'): string {
  return `/api/media/t/${kind}/${color}/${slugify(key) || 'tile'}.svg`;
}

export function hexFor(color: string): string {
  return COLOR_BY_VALUE.get(color)?.hex ?? '#8F2C5B';
}

/**
 * Alt text.
 *
 * Descriptive rather than keyword-stuffed: it names the product, the colour and
 * what the shot shows, which is what a screen-reader user needs and what the
 * SEO brief in the spec asks for.
 */
export function altTextFor(title: string, colorLabel: string, view: number): string {
  const views = [
    `${title} in ${colorLabel}, front view`,
    `${title} in ${colorLabel}, back view`,
    `${title} in ${colorLabel}, fabric and detail close-up`,
    `${title} in ${colorLabel}, side view worn by a model`,
    `${title} in ${colorLabel}, styled flat lay`,
  ];
  return views[view % views.length] ?? views[0];
}
