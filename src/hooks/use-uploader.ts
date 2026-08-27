'use client';

import { useCallback, useRef, useState } from 'react';

/**
 * Upload state, with real progress.
 *
 * Everything here exists because `fetch` cannot report upload progress. It
 * resolves when the response arrives, which for a 9MB photo on a phone is the
 * only thing that happens for forty seconds. `XMLHttpRequest` still emits
 * `upload.onprogress`, so that is what this uses — not nostalgia, the only
 * browser API that answers the question.
 *
 * Two destinations, chosen once per batch:
 *
 *   - ImageKit direct, when the permit route issues one. The bytes go from the
 *     browser to ImageKit without passing through this app.
 *   - `/api/media/upload` otherwise, which stores through the disk driver.
 *
 * Either way the caller gets the same descriptor back, so the components above
 * this do not know or care which happened.
 */

export type UploadStatus = 'queued' | 'uploading' | 'done' | 'error' | 'cancelled';

export interface UploadedFile {
  url: string;
  fileId: string;
  /** The name the person chose it under. Shown back to them, never trusted. */
  name: string;
  contentType: string;
  bytes: number;
  width: number | null;
  height: number | null;
}

export interface UploadItem {
  id: string;
  name: string;
  size: number;
  /** An object URL for the local preview. Revoked when the item is cleared. */
  previewUrl: string | null;
  status: UploadStatus;
  loaded: number;
  /** Smoothed, so the figure does not jump between 200KB/s and 9MB/s. */
  bytesPerSecond: number | null;
  secondsRemaining: number | null;
  error: string | null;
  result: UploadedFile | null;
}

export interface UploaderOptions {
  /** `listing` or `kyc`. Decides which folder the permit is scoped to. */
  purpose: 'listing' | 'kyc';
  /** Called once per file as it lands, so the caller can persist it. */
  onUploaded?: (file: UploadedFile, item: UploadItem) => void | Promise<void>;
}

interface Permit {
  token: string;
  expire: number;
  signature: string;
  publicKey: string;
  urlEndpoint: string;
  folder: string;
}

/**
 * How much of the new rate sample to believe.
 *
 * A pure instantaneous rate is unreadable — it swings with every TCP window —
 * and a pure average never reflects a connection that just got worse. 0.2 lands
 * where the number is steady enough to read and still moves within a second or
 * two of conditions changing.
 */
const RATE_SMOOTHING = 0.2;

export function useUploader({ purpose, onUploaded }: UploaderOptions) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const requests = useRef(new Map<string, XMLHttpRequest>());
  const files = useRef(new Map<string, File>());

  const update = useCallback((id: string, patch: Partial<UploadItem>) => {
    setItems((current) =>
      current.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    );
  }, []);

  /** A permit, or null when direct upload is unavailable for any reason. */
  const requestPermit = useCallback(async (): Promise<Permit | null> => {
    try {
      const response = await fetch('/api/media/imagekit-auth', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ purpose }),
      });
      if (!response.ok) return null;
      const payload = (await response.json()) as { ok: boolean } & Permit;
      return payload.ok ? payload : null;
    } catch {
      // Offline, or the route is not deployed. The fallback path still works.
      return null;
    }
  }, [purpose]);

  const send = useCallback(
    (id: string, file: File, permit: Permit | null) =>
      new Promise<void>((resolve) => {
        const xhr = new XMLHttpRequest();
        requests.current.set(id, xhr);

        const startedAt = performance.now();
        let lastLoaded = 0;
        let lastAt = startedAt;
        let smoothed: number | null = null;

        xhr.upload.onprogress = (event) => {
          if (!event.lengthComputable) return;

          const now = performance.now();
          const elapsed = (now - lastAt) / 1000;

          // Ignore samples closer together than 150ms: the denominator gets
          // small enough to produce nonsense rates.
          if (elapsed >= 0.15) {
            const instant = (event.loaded - lastLoaded) / elapsed;
            smoothed =
              smoothed === null ? instant : smoothed * (1 - RATE_SMOOTHING) + instant * RATE_SMOOTHING;
            lastLoaded = event.loaded;
            lastAt = now;
          }

          const remaining = event.total - event.loaded;
          update(id, {
            status: 'uploading',
            loaded: event.loaded,
            bytesPerSecond: smoothed,
            secondsRemaining: smoothed && smoothed > 0 ? remaining / smoothed : null,
          });
        };

        xhr.onerror = () => {
          update(id, { status: 'error', error: 'The connection dropped.', secondsRemaining: null });
          resolve();
        };

        xhr.onabort = () => {
          update(id, { status: 'cancelled', secondsRemaining: null, bytesPerSecond: null });
          resolve();
        };

        xhr.onload = () => {
          requests.current.delete(id);

          if (xhr.status < 200 || xhr.status >= 300) {
            update(id, {
              status: 'error',
              error: readError(xhr),
              secondsRemaining: null,
              bytesPerSecond: null,
            });
            return resolve();
          }

          try {
            const payload = JSON.parse(xhr.responseText) as Record<string, unknown>;
            const uploaded = permit ? fromImageKit(payload, file) : fromOwnApi(payload, file);

            update(id, {
              status: 'done',
              loaded: file.size,
              secondsRemaining: 0,
              result: uploaded,
            });

            void onUploaded?.(uploaded, {
              id,
              name: file.name,
              size: file.size,
              previewUrl: null,
              status: 'done',
              loaded: file.size,
              bytesPerSecond: null,
              secondsRemaining: 0,
              error: null,
              result: uploaded,
            });
          } catch {
            update(id, { status: 'error', error: 'The upload finished but could not be read.' });
          }
          resolve();
        };

        const body = new FormData();

        if (permit) {
          xhr.open('POST', 'https://upload.imagekit.io/api/v1/files/upload');
          body.set('file', file);
          body.set('fileName', safeName(file.name));
          body.set('folder', permit.folder);
          body.set('publicKey', permit.publicKey);
          body.set('signature', permit.signature);
          body.set('expire', String(permit.expire));
          body.set('token', permit.token);
          body.set('useUniqueFileName', 'true');
        } else {
          xhr.open('POST', '/api/media/upload');
          body.set('purpose', purpose);
          body.set('file', file);
        }

        xhr.send(body);
      }),
    [onUploaded, purpose, update],
  );

  const add = useCallback(
    async (incoming: File[]) => {
      if (incoming.length === 0) return;

      const queued: UploadItem[] = incoming.map((file) => {
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        files.current.set(id, file);
        return {
          id,
          name: file.name,
          size: file.size,
          previewUrl: file.type.startsWith('image/') ? URL.createObjectURL(file) : null,
          status: 'queued',
          loaded: 0,
          bytesPerSecond: null,
          secondsRemaining: null,
          error: null,
          result: null,
        };
      });

      setItems((current) => [...current, ...queued]);

      // One permit per batch: it is a signed window, not a per-file ticket.
      const permit = await requestPermit();

      /*
       * Sequential, not parallel.
       *
       * Four photos racing over one uplink finish no sooner and make every
       * individual progress bar meaningless — they all crawl, and the time
       * remaining is wrong for all of them. One at a time gives an honest
       * figure per file and a predictable queue.
       */
      for (const item of queued) {
        const file = files.current.get(item.id);
        if (!file) continue;
        await send(item.id, file, permit);
      }
    },
    [requestPermit, send],
  );

  const cancel = useCallback((id: string) => {
    requests.current.get(id)?.abort();
    requests.current.delete(id);
  }, []);

  const retry = useCallback(
    async (id: string) => {
      const file = files.current.get(id);
      if (!file) return;
      update(id, { status: 'queued', loaded: 0, error: null, bytesPerSecond: null, secondsRemaining: null });
      const permit = await requestPermit();
      await send(id, file, permit);
    },
    [requestPermit, send, update],
  );

  const remove = useCallback((id: string) => {
    requests.current.get(id)?.abort();
    requests.current.delete(id);
    files.current.delete(id);
    setItems((current) => {
      const going = current.find((item) => item.id === id);
      if (going?.previewUrl) URL.revokeObjectURL(going.previewUrl);
      return current.filter((item) => item.id !== id);
    });
  }, []);

  const clearFinished = useCallback(() => {
    setItems((current) => {
      for (const item of current) {
        if (item.status === 'done' && item.previewUrl) URL.revokeObjectURL(item.previewUrl);
      }
      return current.filter((item) => item.status !== 'done');
    });
  }, []);

  const active = items.filter((item) => item.status === 'uploading' || item.status === 'queued');
  const totalBytes = active.reduce((sum, item) => sum + item.size, 0);
  const loadedBytes = active.reduce((sum, item) => sum + item.loaded, 0);

  return {
    items,
    add,
    cancel,
    retry,
    remove,
    clearFinished,
    busy: active.length > 0,
    /** 0–100 across everything still in flight. */
    overallPercent: totalBytes > 0 ? Math.round((loadedBytes / totalBytes) * 100) : 0,
  };
}

/* -------------------------------------------------------------- responses */

function fromImageKit(payload: Record<string, unknown>, file: File): UploadedFile {
  return {
    url: String(payload.url ?? ''),
    fileId: String(payload.fileId ?? ''),
    name: file.name,
    contentType: String(payload.mime ?? file.type),
    bytes: Number(payload.size ?? file.size),
    width: typeof payload.width === 'number' ? payload.width : null,
    height: typeof payload.height === 'number' ? payload.height : null,
  };
}

function fromOwnApi(payload: Record<string, unknown>, file: File): UploadedFile {
  const media = (payload.media ?? {}) as Record<string, unknown>;
  return {
    url: String(media.url ?? ''),
    fileId: String(media.id ?? ''),
    name: file.name,
    contentType: String(media.contentType ?? file.type),
    bytes: Number(media.bytes ?? file.size),
    width: typeof media.width === 'number' ? media.width : null,
    height: typeof media.height === 'number' ? media.height : null,
  };
}

/** Whatever the far end said, or something a person can act on. */
function readError(xhr: XMLHttpRequest): string {
  try {
    const payload = JSON.parse(xhr.responseText) as { error?: string; message?: string };
    if (payload.error) return payload.error;
    if (payload.message) return payload.message;
  } catch {
    // Not JSON. Fall through.
  }
  if (xhr.status === 413) return 'That file is too large.';
  if (xhr.status === 401 || xhr.status === 403) return 'You are not allowed to upload that.';
  return `The upload failed (${xhr.status || 'no response'}).`;
}

/** Keep the extension, drop anything that would confuse a path. */
function safeName(name: string): string {
  return name.replace(/[^A-Za-z0-9._-]/g, '-').slice(-80);
}
