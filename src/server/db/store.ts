import 'server-only';

import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { DB_VERSION, type CollectionName, type Database, emptyDatabase } from './schema';

/**
 * The data store.
 *
 * This is the seam that a real database sits behind. Everything above it works
 * through repositories and services, so replacing this file with Prisma or a
 * Mongo client changes nothing in the application layer.
 *
 * Two properties matter and are implemented rather than assumed:
 *
 *  1. SERIALISED WRITES. Order placement reads stock, decrements it and writes
 *     an order. Interleaving two of those loses inventory. Every mutation runs
 *     inside an async mutex, so concurrent checkouts queue instead of racing.
 *
 *  2. ROLLBACK. If order creation fails halfway (payment declined after stock
 *     was reserved) the partial writes must not survive. `transaction` snapshots
 *     the collections a unit of work declares and restores them on throw.
 */

const DATA_DIR = process.env.DATA_DIR || '.data';
const DATA_FILE = path.join(process.cwd(), DATA_DIR, 'vestra.json');

let db: Database | null = null;
let bootPromise: Promise<Database> | null = null;

/* --------------------------------------------------------------- mutex */

let writeChain: Promise<unknown> = Promise.resolve();

/** Run `fn` after every previously queued mutation has settled. */
function serialize<T>(fn: () => Promise<T> | T): Promise<T> {
  const run = writeChain.then(fn, fn);
  // Keep the chain alive even when a unit of work rejects.
  writeChain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

/* ---------------------------------------------------------------- boot */

async function boot(): Promise<Database> {
  const shouldReset = process.env.DATA_RESET === 'true';

  if (!shouldReset) {
    const restored = await restoreSnapshot();
    if (restored) return restored;
  }

  // Imported lazily so the seed generator is not pulled into every server
  // bundle that only needs to read data.
  const { seedDatabase } = await import('./seed');
  const seeded = seedDatabase();
  await persistNow(seeded);
  return seeded;
}

async function restoreSnapshot(): Promise<Database | null> {
  try {
    const raw = await readFile(DATA_FILE, 'utf8');
    const parsed = JSON.parse(raw) as Database;
    if (parsed?.meta?.version !== DB_VERSION) return null;
    // Merge onto an empty database so a snapshot written before a new
    // collection existed still boots.
    return { ...emptyDatabase(), ...parsed };
  } catch {
    return null;
  }
}

/** Resolve the live database, seeding or restoring on first access. */
export async function getDb(): Promise<Database> {
  if (db) return db;
  if (!bootPromise) {
    bootPromise = boot().then((value) => {
      db = value;
      return value;
    });
  }
  return bootPromise;
}

/* --------------------------------------------------------- persistence */

let persistTimer: NodeJS.Timeout | null = null;
let persistPending = false;

/**
 * Snapshot writes are debounced and atomic (write to a temp file, then rename)
 * so a crash mid-write cannot leave a truncated snapshot on disk.
 */
async function persistNow(value: Database): Promise<void> {
  try {
    await mkdir(path.dirname(DATA_FILE), { recursive: true });
    const tmp = `${DATA_FILE}.${process.pid}.tmp`;
    await writeFile(tmp, JSON.stringify(value), 'utf8');
    await rename(tmp, DATA_FILE);
  } catch (error) {
    console.error('[vestra:db] snapshot write failed', error);
  }
}

function schedulePersist(): void {
  persistPending = true;
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    if (!persistPending || !db) return;
    persistPending = false;
    void persistNow(db);
  }, 400);
  // Never hold the process open just to flush demo data.
  persistTimer.unref?.();
}

/** Force a synchronous flush. Used by scripts and tests. */
export async function flush(): Promise<void> {
  if (!db) return;
  persistPending = false;
  await persistNow(db);
}

/* -------------------------------------------------------------- access */

/**
 * Read-only access. The returned object must not be mutated -- use
 * `mutate` or `transaction` for anything that changes state.
 */
export async function read<T>(fn: (database: Database) => T): Promise<T> {
  const database = await getDb();
  return fn(database);
}

/** A single mutation, serialised against every other write. */
export async function mutate<T>(fn: (database: Database) => T): Promise<T> {
  const database = await getDb();
  return serialize(() => {
    const result = fn(database);
    schedulePersist();
    return result;
  });
}

/**
 * A unit of work that must apply completely or not at all.
 *
 * Declare the collections it touches; those are snapshotted up front and
 * restored if `fn` throws. Only the named collections are cloned, which keeps
 * order placement cheap even though the catalogue is large.
 */
export async function transaction<T>(
  collections: CollectionName[],
  fn: (database: Database) => Promise<T> | T,
): Promise<T> {
  const database = await getDb();

  return serialize(async () => {
    const backup = new Map<CollectionName, unknown>();
    for (const name of collections) {
      backup.set(name, structuredClone(database[name]));
    }
    const sequenceBackup = structuredClone(database.meta.sequences);

    try {
      const result = await fn(database);
      schedulePersist();
      return result;
    } catch (error) {
      for (const [name, value] of backup) {
        (database as Record<string, unknown>)[name] = value;
      }
      database.meta.sequences = sequenceBackup;
      throw error;
    }
  });
}

/** Next value from a named counter (invoice numbers, settlement runs). */
export function nextSequence(database: Database, key: string): number {
  const current = database.meta.sequences[key] ?? 0;
  const next = current + 1;
  database.meta.sequences[key] = next;
  return next;
}

/** Drop everything and regenerate. Exposed to the admin "reset demo data" tool. */
export async function resetDatabase(): Promise<void> {
  const { seedDatabase } = await import('./seed');
  await serialize(async () => {
    db = seedDatabase();
    bootPromise = Promise.resolve(db);
    await persistNow(db);
  });
}
