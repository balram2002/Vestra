import type { Media, MediaRole } from './types';

/**
 * Reading media by role.
 *
 * A product's assets are one array with three audiences: the gallery, the one
 * landscape video on the product page, and the vertical clips in the reel feed.
 * Every surface must agree on which is which, and an asset written before roles
 * existed has none -- so the fallback lives here rather than being re-guessed
 * at each call site.
 *
 * The fallback is GALLERY on purpose. Everything attached before this existed
 * was a gallery asset, so an old photo keeps showing exactly where it did.
 */
export function mediaRole(asset: Media): MediaRole {
  return asset.role ?? 'GALLERY';
}

/** The photographs, in gallery order. Videos of any role stay out. */
export function galleryAssets(media: Media[]): Media[] {
  return media
    .filter((asset) => mediaRole(asset) === 'GALLERY')
    .sort((a, b) => a.position - b.position);
}

/** The single landscape video for the product page, if there is one. */
export function showcaseVideo(media: Media[]): Media | null {
  return media.find((asset) => mediaRole(asset) === 'SHOWCASE') ?? null;
}

/** The vertical clips, in the order the seller arranged them. */
export function reelAssets(media: Media[]): Media[] {
  return media
    .filter((asset) => mediaRole(asset) === 'REEL')
    .sort((a, b) => a.position - b.position);
}

/**
 * Which role an upload should take, from its shape.
 *
 * A picture is always a gallery asset. A video is a reel when it is taller than
 * it is wide, and the product page's showcase when it is not -- which is what
 * a seller means by "landscape video" and "reel" without being asked to choose
 * from a menu. Callers may still override it; this is only the default.
 */
export function roleForUpload(
  contentType: string,
  width: number | null,
  height: number | null,
): MediaRole {
  if (!contentType.startsWith('video/')) return 'GALLERY';
  if (width && height && height > width) return 'REEL';
  return 'SHOWCASE';
}
