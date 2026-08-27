import 'server-only';

import { createHmac, randomUUID } from 'node:crypto';

import { IMAGEKIT_TOKEN_TTL_SECONDS, imagekit } from '@/config/imagekit';

import { inspect } from './signatures';
import type { MediaStore, UploadResult } from './types';

/**
 * ImageKit driver.
 *
 * Written against ImageKit's REST API rather than its SDK. The surface needed
 * here is four calls — upload, delete, sign, and build a URL — and the SDK
 * neither shrinks that meaningfully nor solves the part that is actually hard
 * (upload progress in the browser, which needs XHR and happens client-side).
 * A dependency that carries a megabyte to save forty lines is not a trade this
 * project makes; see the dependency rule in AGENTS.md.
 *
 * Two upload paths exist, deliberately:
 *
 *   1. SERVER-SIDE, through `put()`. Used when a Server Action already holds
 *      the bytes, and by anything that must validate before storing. The bytes
 *      pass through this process, so the magic-number check happens first.
 *
 *   2. BROWSER-DIRECT, using the signed token from `uploadAuthParams()`. Used
 *      by the upload UI, because real progress and a real time-remaining
 *      figure require the browser to be the one doing the sending. The
 *      signature is minted here, is valid for ten minutes, and is issued only
 *      to a caller the route has already authenticated.
 *
 * Path (2) trades away the byte check on the way in — ImageKit receives the
 * file directly — so it is fenced instead: the token names the folder, the
 * accepted types, and a size cap, and `verifyUploaded()` in `verify.ts` re-reads what
 * actually landed before any of it is attached to a product or an application.
 */

/* ------------------------------------------------------------------ upload */

interface ImageKitUploadResponse {
  fileId: string;
  name: string;
  url: string;
  filePath: string;
  height?: number;
  width?: number;
  size?: number;
  fileType?: string;
  mime?: string;
}

function basicAuth(): string {
  // ImageKit takes the private key as the username with an empty password.
  return `Basic ${Buffer.from(`${imagekit.privateKey}:`).toString('base64')}`;
}

export function imageKitMediaStore(): MediaStore {
  return {
    name: 'imagekit',

    async put(file, { scope }): Promise<UploadResult> {
      const inspected = await inspect(file);
      if (!inspected.ok) return inspected;

      const form = new FormData();
      form.set(
        'file',
        new Blob([new Uint8Array(inspected.bytes)], { type: inspected.signature.contentType }),
        `${scope}-${randomUUID().slice(0, 12)}.${inspected.signature.extension}`,
      );
      form.set('fileName', `${scope}-${randomUUID().slice(0, 12)}.${inspected.signature.extension}`);
      form.set('folder', `${imagekit.folder}/${scope}`);
      // The name is already unique; letting ImageKit rename again would make
      // the returned path unpredictable for no benefit.
      form.set('useUniqueFileName', 'false');

      try {
        const response = await fetch(imagekit.uploadEndpoint, {
          method: 'POST',
          headers: { authorization: basicAuth() },
          body: form,
          signal: AbortSignal.timeout(60_000),
        });

        if (!response.ok) {
          const detail = await response.text().catch(() => '');
          console.error('[vestra:imagekit] upload failed', response.status, detail.slice(0, 300));
          return { ok: false, error: 'That upload could not be saved. Try again.' };
        }

        const payload = (await response.json()) as ImageKitUploadResponse;

        return {
          ok: true,
          media: {
            // The fileId is what `remove` needs, so it is what we keep.
            id: payload.fileId,
            url: payload.url,
            contentType: inspected.signature.contentType,
            bytes: payload.size ?? inspected.bytes.byteLength,
            width: payload.width ?? inspected.width,
            height: payload.height ?? inspected.height,
          },
        };
      } catch (error) {
        console.error('[vestra:imagekit] upload threw', error);
        return { ok: false, error: 'We could not reach the image service. Try again.' };
      }
    },

    /*
     * Nothing to serve.
     *
     * ImageKit-hosted media is fetched from ImageKit's CDN by the browser, not
     * proxied through this app — proxying would throw away the entire point of
     * a CDN. `/api/media/upload/[id]` therefore 404s for these ids, which is
     * correct: no URL this driver hands out ever points at that route.
     */
    async get() {
      return null;
    },

    async remove(id) {
      if (!id) return;
      try {
        const response = await fetch(`${imagekit.apiBase}/files/${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers: { authorization: basicAuth() },
          signal: AbortSignal.timeout(15_000),
        });
        // 404 means it is already gone, which is the desired end state.
        if (!response.ok && response.status !== 404) {
          console.error('[vestra:imagekit] delete failed', id, response.status);
        }
      } catch (error) {
        console.error('[vestra:imagekit] delete threw', id, error);
      }
    },
  };
}

/* --------------------------------------------------- browser-direct upload */

export interface UploadAuthParams {
  token: string;
  expire: number;
  signature: string;
  publicKey: string;
  urlEndpoint: string;
  folder: string;
}

/**
 * Sign a short-lived permit for one browser upload.
 *
 * ImageKit's scheme is a HMAC-SHA1 of `token + expire` under the private key.
 * The token is single-use by convention and the expiry is what bounds the
 * damage if one leaks: ten minutes is long enough for a slow phone on a bad
 * connection to finish a 10MB photo, and short enough to be worthless later.
 */
export function uploadAuthParams(scope: string): UploadAuthParams {
  const token = randomUUID();
  const expire = Math.floor(Date.now() / 1000) + IMAGEKIT_TOKEN_TTL_SECONDS;

  const signature = createHmac('sha1', imagekit.privateKey)
    .update(token + expire)
    .digest('hex');

  return {
    token,
    expire,
    signature,
    publicKey: imagekit.publicKey,
    urlEndpoint: imagekit.urlEndpoint,
    folder: `${imagekit.folder}/${scope}`,
  };
}
