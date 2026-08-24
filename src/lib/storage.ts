/**
 * Namespaced, versioned, failure-tolerant browser storage.
 *
 * Storage can throw (private mode, quota, blocked cookies) and can contain data
 * written by an older build. Every read is guarded and every namespace carries a
 * schema version so a breaking change discards stale data instead of crashing
 * the app on boot.
 */

const NAMESPACE = 'vestra';

export interface StorageSlot<T> {
  read(): T | null;
  write(value: T): void;
  clear(): void;
  key: string;
}

export function createSlot<T>(name: string, version = 1): StorageSlot<T> {
  const key = `${NAMESPACE}.${name}`;
  const versionKey = `${key}.__v`;

  return {
    key,
    read() {
      try {
        const storedVersion = Number(window.localStorage.getItem(versionKey) ?? version);
        if (storedVersion !== version) {
          window.localStorage.removeItem(key);
          window.localStorage.setItem(versionKey, String(version));
          return null;
        }
        const raw = window.localStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : null;
      } catch {
        return null;
      }
    },
    write(value: T) {
      try {
        window.localStorage.setItem(key, JSON.stringify(value));
        window.localStorage.setItem(versionKey, String(version));
      } catch {
        // Quota exceeded or storage unavailable: the app must keep working with
        // in-memory state only, so this is intentionally swallowed.
      }
    },
    clear() {
      try {
        window.localStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    },
  };
}

export function createSessionSlot<T>(name: string): StorageSlot<T> {
  const key = `${NAMESPACE}.${name}`;
  return {
    key,
    read() {
      try {
        const raw = window.sessionStorage.getItem(key);
        return raw ? (JSON.parse(raw) as T) : null;
      } catch {
        return null;
      }
    },
    write(value: T) {
      try {
        window.sessionStorage.setItem(key, JSON.stringify(value));
      } catch {
        /* ignore */
      }
    },
    clear() {
      try {
        window.sessionStorage.removeItem(key);
      } catch {
        /* ignore */
      }
    },
  };
}

/** Remove every Vestra key. Used by "reset demo data" and by sign-out-everywhere. */
export function clearAllStorage(): void {
  try {
    const doomed: string[] = [];
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i);
      if (key?.startsWith(`${NAMESPACE}.`)) doomed.push(key);
    }
    doomed.forEach((key) => window.localStorage.removeItem(key));
  } catch {
    /* ignore */
  }
}
