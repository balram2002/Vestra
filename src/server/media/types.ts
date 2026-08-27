/**
 * The media storage contract.
 *
 * Its own module so a driver can import it without importing its siblings —
 * otherwise the ImageKit driver drags in `node:fs` and the disk driver drags in
 * ImageKit's config, and both are loaded whichever one is actually in use.
 */

export interface StoredMedia {
  id: string;
  url: string;
  contentType: string;
  bytes: number;
  width: number | null;
  height: number | null;
}

export type UploadResult = { ok: true; media: StoredMedia } | { ok: false; error: string };

export interface MediaStore {
  readonly name: string;
  put(file: File, options: { scope: string }): Promise<UploadResult>;
  /** Bytes to serve, for drivers that this app serves itself. CDN-backed drivers return null. */
  get(id: string): Promise<{ body: Buffer; contentType: string } | null>;
  remove(id: string): Promise<void>;
}
