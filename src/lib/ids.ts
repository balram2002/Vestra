/**
 * Identifier generation.
 *
 * Human-facing identifiers (order numbers, AWBs, invoice numbers) are formatted
 * so that a support agent can read one over a phone call without ambiguity:
 * uppercase, no vowels-that-look-like-digits, grouped in short runs.
 */

const UNAMBIGUOUS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // no 0/O, 1/I/L

let counter = Math.floor(Math.random() * 1000);

function token(length: number): string {
  let out = '';
  const bytes = new Uint8Array(length);
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  for (let i = 0; i < length; i++) out += UNAMBIGUOUS[bytes[i] % UNAMBIGUOUS.length];
  return out;
}

/** Internal entity id: `prd_9F3KQ2M8`. Opaque, never shown to shoppers. */
export function entityId(prefix: string): string {
  counter = (counter + 1) % 100000;
  return `${prefix}_${token(8)}${counter.toString(36).toUpperCase().padStart(3, '0')}`;
}

export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${token(10).toLowerCase()}`;
}

function yymm(date = new Date()): string {
  return `${String(date.getFullYear()).slice(2)}${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** Customer-facing order number: VS-2508-4KQ9M2 */
export function orderNumber(date = new Date()): string {
  return `VS-${yymm(date)}-${token(6)}`;
}

/** One seller's slice of a customer order: VS-2508-4KQ9M2-S1 */
export function sellerOrderNumber(orderNo: string, index: number): string {
  return `${orderNo}-S${index + 1}`;
}

/** Shipment reference issued by Vestra (distinct from the courier AWB). */
export function shipmentNumber(date = new Date()): string {
  return `SHP-${yymm(date)}-${token(7)}`;
}

/** Courier airway bill. Eshopbox-style numeric AWB. */
export function awbNumber(): string {
  let digits = '';
  for (let i = 0; i < 12; i++) digits += Math.floor(Math.random() * 10);
  return digits;
}

export function invoiceNumber(sellerCode: string, sequence: number, date = new Date()): string {
  const fy = fiscalYearLabel(date);
  return `INV/${sellerCode}/${fy}/${String(sequence).padStart(5, '0')}`;
}

export function creditNoteNumber(sellerCode: string, sequence: number, date = new Date()): string {
  return `CRN/${sellerCode}/${fiscalYearLabel(date)}/${String(sequence).padStart(5, '0')}`;
}

/** Indian fiscal year runs April-March: 2025-26. */
export function fiscalYearLabel(date = new Date()): string {
  const year = date.getMonth() >= 3 ? date.getFullYear() : date.getFullYear() - 1;
  return `${year}-${String(year + 1).slice(2)}`;
}

export function paymentReference(provider: string): string {
  return `${provider.slice(0, 4).toLowerCase()}_${token(14).toLowerCase()}`;
}

export function refundReference(): string {
  return `rfnd_${token(14).toLowerCase()}`;
}

export function returnNumber(orderNo: string): string {
  return `RTN-${orderNo.split('-').slice(1).join('-')}-${token(3)}`;
}

export function exchangeNumber(orderNo: string): string {
  return `EXC-${orderNo.split('-').slice(1).join('-')}-${token(3)}`;
}

export function ticketNumber(date = new Date()): string {
  return `TKT-${yymm(date)}-${token(5)}`;
}

export function settlementNumber(date = new Date()): string {
  return `STL-${yymm(date)}-${token(5)}`;
}

/** Seller SKU fallback when a seller does not supply their own. */
export function skuCode(brandCode: string, styleCode: string, size: string, colorCode: string): string {
  return [brandCode, styleCode, colorCode, size]
    .map((part) => part.replace(/[^A-Za-z0-9]/g, '').toUpperCase())
    .join('-');
}

/** EAN-13 style barcode with a valid check digit. */
export function barcode(seed: number): string {
  const base = String(890_000_000_000 + (seed % 99_999_999_999)).slice(0, 12);
  let sum = 0;
  for (let i = 0; i < 12; i++) sum += Number(base[i]) * (i % 2 === 0 ? 1 : 3);
  const check = (10 - (sum % 10)) % 10;
  return base + check;
}
