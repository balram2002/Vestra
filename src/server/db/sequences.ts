import 'server-only';

import { getDb } from './client';
import { COLLECTIONS } from './collections';

/**
 * Monotonic counters for human-facing document numbers.
 *
 * Order numbers, invoice numbers and settlement runs must be gapless and
 * unique: finance reconciles on them and tax authorities expect an unbroken
 * invoice series. Deriving them from a `count()` races under concurrent
 * checkout and silently issues duplicates.
 *
 * `findOneAndUpdate` with `$inc` and `upsert` is atomic on a single document,
 * which is exactly the guarantee needed here and needs no transaction.
 */

interface Counter {
  _id: string;
  value: number;
}

/** Reserve the next value from a named counter. */
export async function nextSequence(key: string): Promise<number> {
  const db = await getDb();
  const result = await db.collection<Counter>(COLLECTIONS.counters).findOneAndUpdate(
    { _id: key },
    { $inc: { value: 1 } },
    { upsert: true, returnDocument: 'after' },
  );

  if (!result) {
    throw new Error(`[vestra:db] sequence "${key}" could not be advanced`);
  }
  return result.value;
}

/**
 * Reserve a contiguous block in one round trip. Bulk operations (a settlement
 * run issuing 400 invoices) would otherwise pay a database call per number.
 */
export async function nextSequenceBlock(key: string, count: number): Promise<number[]> {
  if (count <= 0) return [];

  const db = await getDb();
  const result = await db.collection<Counter>(COLLECTIONS.counters).findOneAndUpdate(
    { _id: key },
    { $inc: { value: count } },
    { upsert: true, returnDocument: 'after' },
  );

  if (!result) {
    throw new Error(`[vestra:db] sequence "${key}" could not be advanced`);
  }

  const end = result.value;
  const start = end - count + 1;
  return Array.from({ length: count }, (_, i) => start + i);
}

/** Read without consuming. For dashboards only -- never to derive an id. */
export async function peekSequence(key: string): Promise<number> {
  const db = await getDb();
  const doc = await db.collection<Counter>(COLLECTIONS.counters).findOne({ _id: key });
  return doc?.value ?? 0;
}

/* ------------------------------------------------------- number formats */

const FY_START_MONTH = 3; // April, per the Indian financial year.

/** Financial year label, e.g. "2526" for FY 2025-26. */
export function financialYear(at: Date = new Date()): string {
  const year = at.getFullYear();
  const startYear = at.getMonth() >= FY_START_MONTH ? year : year - 1;
  return `${String(startYear).slice(2)}${String(startYear + 1).slice(2)}`;
}

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

/**
 * Customer-facing order number. Scoped per financial year so the series
 * restarts annually, which is what accounting expects.
 */
export async function nextOrderNumber(at: Date = new Date()): Promise<string> {
  const fy = financialYear(at);
  const value = await nextSequence(`order:${fy}`);
  return `VS${fy}${pad(value, 7)}`;
}

/** One per seller per order: what the seller sees in their console. */
export async function nextSellerOrderNumber(at: Date = new Date()): Promise<string> {
  const fy = financialYear(at);
  const value = await nextSequence(`sellerOrder:${fy}`);
  return `SO${fy}${pad(value, 7)}`;
}

/**
 * GST invoices are issued per seller, so the series is per seller per year --
 * a shared series would break each seller's own filings.
 */
export async function nextInvoiceNumber(sellerCode: string, at: Date = new Date()): Promise<string> {
  const fy = financialYear(at);
  const value = await nextSequence(`invoice:${sellerCode}:${fy}`);
  return `${sellerCode}/${fy}/${pad(value, 6)}`;
}

export async function nextReturnNumber(at: Date = new Date()): Promise<string> {
  const fy = financialYear(at);
  const value = await nextSequence(`return:${fy}`);
  return `RT${fy}${pad(value, 6)}`;
}

export async function nextExchangeNumber(at: Date = new Date()): Promise<string> {
  const fy = financialYear(at);
  const value = await nextSequence(`exchange:${fy}`);
  return `EX${fy}${pad(value, 6)}`;
}

export async function nextSettlementNumber(at: Date = new Date()): Promise<string> {
  const fy = financialYear(at);
  const value = await nextSequence(`settlement:${fy}`);
  return `ST${fy}${pad(value, 6)}`;
}

export async function nextTicketNumber(at: Date = new Date()): Promise<string> {
  const fy = financialYear(at);
  const value = await nextSequence(`ticket:${fy}`);
  return `HD${fy}${pad(value, 6)}`;
}
