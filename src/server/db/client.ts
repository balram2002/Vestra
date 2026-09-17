import 'server-only';

import { MongoClient, type Db, type MongoClientOptions } from 'mongodb';

/**
 * MongoDB connection.
 *
 * Two things this file exists to guarantee:
 *
 *  1. ONE POOL PER PROCESS. Next.js hot-reloads server modules on every edit in
 *     development, which would otherwise open a fresh pool per reload until the
 *     server runs out of sockets. The client is therefore parked on `globalThis`
 *     and reused across reloads.
 *
 *  2. NO CONNECTION AT IMPORT TIME. `cacheComponents` prerenders route shells at
 *     build time; a module that dials the database on import would make the
 *     build require a live server. Connection is lazy and awaited per call.
 *
 * Note on transactions: MongoDB only offers multi-document transactions on a
 * replica set. This deployment targets a standalone server, so nothing here
 * assumes sessions. Atomicity is obtained where it actually matters --
 * inventory -- via single-document conditional updates, and cross-document
 * units of work use the compensating-action runner in `saga.ts`.
 */

const DEFAULT_URI = 'mongodb://127.0.0.1:27017';
const DEFAULT_DB = 'vestra';

/*
 * The build prerenders pages from the database with several workers dialling
 * a hosted cluster at once, and a cold DNS lookup plus a first TLS handshake
 * can outlast five seconds: one slow connection used to fail the whole build.
 * A build can afford to wait; a shopper's request cannot.
 */
const building = process.env.NEXT_PHASE === 'phase-production-build';

const options: MongoClientOptions = {
  // Fail fast rather than hanging a request for 30s when Mongo is down: the
  // service layer turns this into a visible error state instead of a spinner.
  serverSelectionTimeoutMS: building ? 30_000 : 5_000,
  connectTimeoutMS: 10_000,
  maxPoolSize: 20,
  minPoolSize: 2,
  retryWrites: true,
  retryReads: true,
  ignoreUndefined: true,
};

declare global {
  var __vestraMongo: { client: MongoClient; promise: Promise<MongoClient> } | undefined;
}

function uri(): string {
  return process.env.MONGODB_URI || DEFAULT_URI;
}

function dbName(): string {
  return process.env.MONGODB_DB || DEFAULT_DB;
}

function connect(): Promise<MongoClient> {
  if (global.__vestraMongo) return global.__vestraMongo.promise;

  const client = new MongoClient(uri(), options);
  const promise = client.connect().catch(async (error: unknown) => {
    // A cold database can miss the first connection window. Keep the pool
    // shared, but let the next request establish a fresh one after recovery.
    if (global.__vestraMongo?.client === client) global.__vestraMongo = undefined;
    await client.close();
    throw error;
  });
  global.__vestraMongo = { client, promise };
  return promise;
}

/** The connected database handle. Safe to call on every request. */
export async function getDb(): Promise<Db> {
  const client = await connect();
  return client.db(dbName());
}

/** Exposed for scripts and tests that need to close the pool deterministically. */
export async function closeDb(): Promise<void> {
  if (!global.__vestraMongo) return;
  const { client } = global.__vestraMongo;
  global.__vestraMongo = undefined;
  await client.close();
}

/**
 * A cheap liveness probe. Used by the health route and by the seed script so a
 * missing database produces a clear message instead of a stack trace.
 */
export async function pingDb(): Promise<{ ok: boolean; error?: string }> {
  try {
    const db = await getDb();
    await db.command({ ping: 1 });
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) };
  }
}
