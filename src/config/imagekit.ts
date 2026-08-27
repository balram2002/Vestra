/**
 * ImageKit configuration.
 *
 * Three values, and the app behaves differently depending on whether they are
 * all present:
 *
 *   IMAGEKIT_PRIVATE_KEY            server only — uploads, deletes, signatures
 *   NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY browser — direct uploads
 *   NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT  https://ik.imagekit.io/<id>
 *
 * Configured: every upload goes to ImageKit and every `next/image` request is
 * served from it, including remote photography, which ImageKit fetches through
 * its web-proxy origin.
 *
 * Not configured: the local disk driver and Next's own optimiser take over, so
 * a clone of this repository still runs with no accounts to create. The
 * fallback is deliberate and visible rather than a crash on a missing key.
 *
 * The public key and endpoint are `NEXT_PUBLIC_` because the browser genuinely
 * needs them: a direct upload with real progress goes from the browser to
 * ImageKit, not through this server. The private key never leaves the server
 * and is used only to sign short-lived upload tokens.
 */

export const imagekit = {
  urlEndpoint: (process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT ?? '').replace(/\/+$/, ''),
  publicKey: process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY ?? '',
  /** Empty in the browser. Only ever read on the server. */
  privateKey: process.env.IMAGEKIT_PRIVATE_KEY ?? '',
  /** Everything this app uploads lives under one prefix. */
  folder: process.env.IMAGEKIT_FOLDER ?? '/vestra',
  uploadEndpoint: 'https://upload.imagekit.io/api/v1/files/upload',
  apiBase: 'https://api.imagekit.io/v1',
} as const;

/**
 * Whether the BROWSER can address ImageKit.
 *
 * Safe to call from client components: it reads only the two public values.
 * Used by the image loader, which runs in both environments.
 */
export function imageKitDeliveryReady(): boolean {
  return Boolean(imagekit.urlEndpoint && imagekit.publicKey);
}

/** Whether the server can upload, delete and sign. Server only. */
export function imageKitReady(): boolean {
  return Boolean(imagekit.urlEndpoint && imagekit.publicKey && imagekit.privateKey);
}

/** How long a signed upload token stays valid. */
export const IMAGEKIT_TOKEN_TTL_SECONDS = 60 * 10;
