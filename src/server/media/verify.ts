import 'server-only';

import { imagekit, imageKitReady } from '@/config/imagekit';

import { detect, readDimensions } from './signatures';
import { mediaStore } from './store';

/**
 * Check a file that was uploaded without passing through this process.
 *
 * The upload UI sends bytes straight from the browser, so by the time a Server
 * Action is asked to attach a URL to a product or an application, nothing on
 * this side has seen what is at the other end of it. Two things therefore have
 * to be established before it is written down:
 *
 *   1. the URL is one of OURS — otherwise an attacker who can call the action
 *      can hang arbitrary remote content off a listing;
 *   2. the bytes are the image they claim to be — the same magic-number test
 *      the server-side upload path applies.
 *
 * Both drivers are handled here rather than in either driver, because the
 * caller should not have to know which one is configured.
 */

export type VerifyResult =
  | { ok: true; contentType: string; width: number | null; height: number | null }
  | { ok: false; error: string };

/** Enough for a PNG header and for a JPEG's start-of-frame in almost every case. */
const HEAD_BYTES = 2048;

export async function verifyUploaded(url: string): Promise<VerifyResult> {
  if (!url) return { ok: false, error: 'That upload has no address.' };

  /*
   * The disk driver's own route.
   *
   * These bytes DID pass through `mediaStore().put()`, which already rejected
   * anything whose header disagreed with its claim — so this is a re-read for
   * dimensions and an existence check, not a second opinion. It still runs,
   * because "the file is actually there" is worth knowing before a product
   * page starts linking to it.
   */
  if (url.startsWith('/api/media/upload/')) {
    const id = url.slice('/api/media/upload/'.length);
    const file = await mediaStore().get(id);
    if (!file) return { ok: false, error: 'That upload could not be found.' };

    const head = new Uint8Array(file.body.subarray(0, HEAD_BYTES));
    return finish(head);
  }

  if (imageKitReady() && url.startsWith(`${imagekit.urlEndpoint}/`)) {
    try {
      const response = await fetch(url, {
        headers: { range: `bytes=0-${HEAD_BYTES - 1}` },
        signal: AbortSignal.timeout(15_000),
      });

      // 206 is the ranged success; 200 means the origin ignored the range and
      // sent everything, which is still usable.
      if (!response.ok && response.status !== 206) {
        return { ok: false, error: 'That upload could not be read back.' };
      }

      return finish(new Uint8Array(await response.arrayBuffer()));
    } catch (error) {
      console.error('[vestrawab:media] verification threw', error);
      return { ok: false, error: 'We could not verify that upload.' };
    }
  }

  // Anything else is not ours, whatever it claims.
  return { ok: false, error: 'That file is not from our media library.' };
}

function finish(head: Uint8Array): VerifyResult {
  const signature = detect(head.subarray(0, 16));
  if (!signature) {
    return { ok: false, error: 'That file is not a JPEG, PNG, WebP, AVIF or MP4.' };
  }

  const dimensions = readDimensions(head, signature.contentType);
  return {
    ok: true,
    contentType: signature.contentType,
    width: dimensions?.width ?? null,
    height: dimensions?.height ?? null,
  };
}
