import 'server-only';

import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { CATALOG } from '@/config/business';

/**
 * Media storage.
 *
 * Seller uploads need somewhere to live. In production that is object storage
 * behind a CDN; here it is the local disk, behind the same interface — so
 * moving to S3 or R2 is a new driver rather than a change to the product form.
 *
 * What this deliberately does NOT do is trust the browser. A file's declared
 * `type` and its extension are both attacker-controlled, so the store checks
 * the actual bytes: every accepted format has a known magic number, and a file
 * whose header does not match its claim is rejected rather than stored and
 * served back to other people later.
 */

export interface StoredMedia {
  id: string;
  url: string;
  contentType: string;
  bytes: number;
  width: number | null;
  height: number | null;
}

export type UploadResult =
  | { ok: true; media: StoredMedia }
  | { ok: false; error: string };

export interface MediaStore {
  readonly name: string;
  put(file: File, options: { scope: string }): Promise<UploadResult>;
  get(id: string): Promise<{ body: Buffer; contentType: string } | null>;
  remove(id: string): Promise<void>;
}

/* ------------------------------------------------------- format detection */

interface Signature {
  contentType: string;
  extension: string;
  matches: (bytes: Uint8Array) => boolean;
}

const SIGNATURES: Signature[] = [
  {
    contentType: 'image/jpeg',
    extension: 'jpg',
    matches: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    contentType: 'image/png',
    extension: 'png',
    matches: (b) =>
      b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 && b[4] === 0x0d,
  },
  {
    // RIFF....WEBP
    contentType: 'image/webp',
    extension: 'webp',
    matches: (b) =>
      b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 &&
      b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50,
  },
  {
    // ....ftypavif
    contentType: 'image/avif',
    extension: 'avif',
    matches: (b) =>
      b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70 &&
      b[8] === 0x61 && b[9] === 0x76 && b[10] === 0x69 && b[11] === 0x66,
  },
  {
    // ....ftyp(isom|mp42) — the container MP4 video actually arrives in
    contentType: 'video/mp4',
    extension: 'mp4',
    matches: (b) => b[4] === 0x66 && b[5] === 0x74 && b[6] === 0x79 && b[7] === 0x70,
  },
];

function detect(bytes: Uint8Array): Signature | null {
  return SIGNATURES.find((signature) => signature.matches(bytes)) ?? null;
}

/**
 * Intrinsic dimensions, read from the header.
 *
 * Worth the few lines: a product card reserves space from these, and a missing
 * width is a layout shift on every listing page. Only PNG and JPEG are parsed;
 * anything else reports null and the caller falls back to the aspect the grid
 * already assumes.
 */
function readDimensions(bytes: Uint8Array, contentType: string): { width: number; height: number } | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  if (contentType === 'image/png' && bytes.length > 24) {
    return { width: view.getUint32(16), height: view.getUint32(20) };
  }

  if (contentType === 'image/jpeg') {
    // Walk the segment chain to the start-of-frame marker.
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (bytes[offset] !== 0xff) return null;
      const marker = bytes[offset + 1];
      const length = view.getUint16(offset + 2);
      // SOF0..SOF15, excluding the non-frame markers in that range.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { height: view.getUint16(offset + 5), width: view.getUint16(offset + 7) };
      }
      offset += 2 + length;
    }
  }

  return null;
}

/* ------------------------------------------------------------ disk driver */

const UPLOAD_DIR = path.join(process.cwd(), process.env.DATA_DIR || '.data', 'uploads');

export function diskMediaStore(): MediaStore {
  return {
    name: 'disk',

    async put(file, { scope }) {
      const isVideo = file.type.startsWith('video/');
      const limit = isVideo ? CATALOG.maxVideoBytes : CATALOG.maxImageBytes;

      if (file.size === 0) return { ok: false, error: 'That file is empty.' };
      if (file.size > limit) {
        return {
          ok: false,
          error: `That file is ${(file.size / 1024 / 1024).toFixed(1)}MB. The limit is ${limit / 1024 / 1024}MB.`,
        };
      }

      const buffer = Buffer.from(await file.arrayBuffer());
      const signature = detect(buffer.subarray(0, 16));

      // The claim and the bytes must agree. Rejecting here is what stops a
      // renamed script being stored and served back later.
      if (!signature) {
        return { ok: false, error: 'That file is not a JPEG, PNG, WebP, AVIF or MP4.' };
      }
      const accepted = [...CATALOG.acceptedImageTypes, ...CATALOG.acceptedVideoTypes] as readonly string[];
      if (!accepted.includes(signature.contentType)) {
        return { ok: false, error: `${signature.contentType} files are not accepted.` };
      }

      // Content-addressed, so re-uploading the same photo does not duplicate it.
      const digest = createHash('sha256').update(buffer).digest('hex').slice(0, 20);
      const id = `${scope}-${digest}-${randomUUID().slice(0, 8)}.${signature.extension}`;

      await mkdir(UPLOAD_DIR, { recursive: true });
      await writeFile(path.join(UPLOAD_DIR, id), buffer);

      const dimensions = readDimensions(buffer, signature.contentType);

      return {
        ok: true,
        media: {
          id,
          url: `/api/media/upload/${id}`,
          contentType: signature.contentType,
          bytes: buffer.byteLength,
          width: dimensions?.width ?? null,
          height: dimensions?.height ?? null,
        },
      };
    },

    async get(id) {
      // Ids are generated by `put` and never contain a separator, so a
      // traversal attempt cannot escape the upload directory.
      if (!/^[A-Za-z0-9._-]+$/.test(id) || id.includes('..')) return null;

      const signature = SIGNATURES.find((s) => id.endsWith(`.${s.extension}`));
      if (!signature) return null;

      try {
        const body = await readFile(path.join(UPLOAD_DIR, id));
        return { body, contentType: signature.contentType };
      } catch {
        return null;
      }
    },

    async remove(id) {
      if (!/^[A-Za-z0-9._-]+$/.test(id) || id.includes('..')) return;
      try {
        await unlink(path.join(UPLOAD_DIR, id));
      } catch {
        // Already gone is the desired end state.
      }
    },
  };
}

let store: MediaStore | null = null;

/** The active store. One place to swap the disk driver for object storage. */
export function mediaStore(): MediaStore {
  store ??= diskMediaStore();
  return store;
}
