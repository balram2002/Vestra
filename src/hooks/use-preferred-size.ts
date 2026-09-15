'use client';

import { useSyncExternalStore } from 'react';

import type { SizeSystem } from '@/domain/attributes';

/**
 * The shopper's usual sizes, as this browser remembers them.
 *
 * The account holds the real list. A product page is cached and served to
 * everyone, so it cannot ask the account without becoming a per-request page;
 * instead the profile screen writes a copy here whenever it loads or saves,
 * and the size picker reads it. Signing out clears it.
 *
 * It is a HINT, and it is only ever shown as one: "your usual size is M". It
 * never picks a size by itself, because a stale copy on a shared device must
 * not be able to put the wrong size in somebody's bag.
 *
 * An external store for the usual reason: the value lives in `localStorage`
 * and can change from another tab, and `useSyncExternalStore` renders the
 * server's empty answer first and the stored one straight after, with no
 * effect-driven second paint.
 */

const STORAGE_KEY = 'vestra-preferred-sizes';
const CHANGE_EVENT = 'vestra:preferred-sizes';

function readRaw(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    return '';
  }
}

function subscribe(listener: () => void): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) listener();
  };
  window.addEventListener('storage', onStorage);
  window.addEventListener(CHANGE_EVENT, listener);
  return () => {
    window.removeEventListener('storage', onStorage);
    window.removeEventListener(CHANGE_EVENT, listener);
  };
}

export function usePreferredSize(system: SizeSystem | undefined): string | null {
  // The raw string is the snapshot: a primitive, so React's equality check
  // needs no memoisation, and parsing happens only when it actually changed.
  const raw = useSyncExternalStore(subscribe, readRaw, () => '');
  if (!system || !raw) return null;

  try {
    const value: unknown = (JSON.parse(raw) as Record<string, unknown>)[system];
    return typeof value === 'string' && value ? value : null;
  } catch {
    return null;
  }
}

export function writePreferredSizes(sizes: Record<string, string>): void {
  try {
    if (Object.keys(sizes).length === 0) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(sizes));
  } catch {
    // Storage blocked in a private window: the hint simply does not appear.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function clearPreferredSizes(): void {
  writePreferredSizes({});
}
