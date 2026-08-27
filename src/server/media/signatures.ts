import 'server-only';

import { CATALOG } from '@/config/business';

/**
 * What a file actually is, according to its bytes.
 *
 * Extracted so every driver checks the same way. A file's declared `type` and
 * its extension are both attacker-controlled, so neither is consulted: each
 * accepted format has a known magic number, and a file whose header does not
 * match its claim is rejected rather than stored and served back to other
 * people later.
 *
 * This matters more, not less, when the bytes are going to a third party.
 * ImageKit will happily store whatever it is given, and it is served from a
 * host that is not ours — so the check has to happen here, on the way through.
 */

export interface Signature {
  contentType: string;
  extension: string;
  matches: (bytes: Uint8Array) => boolean;
}

export const SIGNATURES: Signature[] = [
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

export function detect(bytes: Uint8Array): Signature | null {
  return SIGNATURES.find((signature) => signature.matches(bytes)) ?? null;
}

export type InspectionResult =
  | { ok: true; signature: Signature; bytes: Buffer; width: number | null; height: number | null }
  | { ok: false; error: string };

/**
 * Read a file, decide whether it is acceptable, and measure it.
 *
 * One function so no driver can accidentally skip a step. The messages are
 * written for the person who chose the file, because they are shown to them.
 */
export async function inspect(file: File): Promise<InspectionResult> {
  const isVideo = file.type.startsWith('video/');
  const limit = isVideo ? CATALOG.maxVideoBytes : CATALOG.maxImageBytes;

  if (file.size === 0) return { ok: false, error: 'That file is empty.' };
  if (file.size > limit) {
    return {
      ok: false,
      error: `That file is ${(file.size / 1024 / 1024).toFixed(1)}MB. The limit is ${limit / 1024 / 1024}MB.`,
    };
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  const signature = detect(bytes.subarray(0, 16));

  if (!signature) {
    return { ok: false, error: 'That file is not a JPEG, PNG, WebP, AVIF or MP4.' };
  }

  const accepted = [
    ...CATALOG.acceptedImageTypes,
    ...CATALOG.acceptedVideoTypes,
  ] as readonly string[];

  if (!accepted.includes(signature.contentType)) {
    return { ok: false, error: `${signature.contentType} files are not accepted.` };
  }

  const dimensions = readDimensions(bytes, signature.contentType);

  return {
    ok: true,
    signature,
    bytes,
    width: dimensions?.width ?? null,
    height: dimensions?.height ?? null,
  };
}

/**
 * Intrinsic dimensions, read from the header.
 *
 * Worth the few lines: a product card reserves space from these, and a missing
 * width is a layout shift on every listing page. Only PNG and JPEG are parsed;
 * anything else reports null and the caller falls back to the aspect the grid
 * already assumes.
 */
export function readDimensions(
  bytes: Uint8Array,
  contentType: string,
): { width: number; height: number } | null {
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
