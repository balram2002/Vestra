import 'server-only';

import { PRICING } from '@/config/business';
import type {
  Invoice,
  InvoiceLine,
  Order,
  OrderItem,
  Seller,
  SellerOrder,
  TaxLine,
} from '@/domain/types';
import { amountInWords } from '@/lib/amount-in-words';
import { entityId } from '@/lib/ids';
import { aggregateTaxLines } from '@/lib/pricing/tax';
import { roundToRupee, sumPaise } from '@/lib/money';

import { collections, toEntities, toEntity } from '../db/collections';
import { nextInvoiceNumber } from '../db/sequences';

/**
 * GST tax invoices and credit notes.
 *
 * On a marketplace the invoice is raised by the SELLER, not by the platform:
 * the seller is the supplier of record, so the series is per seller per
 * financial year and carries their GSTIN. A single shared series would break
 * every seller's own filings.
 *
 * Three things this gets right that are easy to get wrong:
 *
 *  1. THE NUMBERS COME FROM THE ORDER ITEM, never from today's catalogue. The
 *     line froze its price, discount share and tax at purchase, so an invoice
 *     reprinted a year later is byte-identical to the original.
 *
 *  2. PLACE OF SUPPLY DECIDES THE TAX SPLIT. Same state as the seller means
 *     CGST + SGST; a different state means IGST. It is not a display choice.
 *
 *  3. AN INVOICE IS NEVER EDITED. A return does not amend the invoice, it
 *     raises a CREDIT NOTE against it. That is both the legal requirement and
 *     the only way the two documents reconcile.
 */

/**
 * Raise the tax invoice for a seller order.
 *
 * Idempotent: a seller order already invoiced returns the existing document
 * rather than burning another number in the series. Gaps in an invoice series
 * are a compliance problem, so numbers are only ever consumed once.
 */
export async function issueInvoice(
  sellerOrderId: string,
): Promise<{ ok: boolean; error?: string; invoiceId?: string }> {
  const invoices = await collections.invoices();

  const existing = toEntity(
    await invoices.findOne({ sellerOrderId, type: 'TAX_INVOICE' }),
  );
  if (existing) return { ok: true, invoiceId: existing.id };

  const sellerOrders = await collections.sellerOrders();
  const sellerOrder = toEntity(await sellerOrders.findOne({ _id: sellerOrderId }));
  if (!sellerOrder) return { ok: false, error: 'Seller order not found.' };

  const orders = await collections.orders();
  const order = toEntity(await orders.findOne({ _id: sellerOrder.orderId }));
  if (!order) return { ok: false, error: 'Order not found.' };

  const sellers = await collections.sellers();
  const seller = toEntity(await sellers.findOne({ _id: sellerOrder.sellerId }));
  if (!seller) return { ok: false, error: 'Seller not found.' };

  const itemCol = await collections.orderItems();
  const items = toEntities(await itemCol.find({ sellerOrderId }).toArray()).filter(
    (item) => item.status !== 'CANCELLED',
  );
  if (items.length === 0) return { ok: false, error: 'Nothing on this order to invoice.' };

  const invoice = buildInvoice({
    id: entityId('inv'),
    invoiceNumber: await nextInvoiceNumber(seller.code, new Date()),
    type: 'TAX_INVOICE',
    order,
    sellerOrder,
    seller,
    items,
    relatedInvoiceId: null,
  });

  await invoices.insertOne({ ...invoice, _id: invoice.id });
  await sellerOrders.updateOne({ _id: sellerOrderId }, { $set: { invoiceId: invoice.id } });

  return { ok: true, invoiceId: invoice.id };
}

/**
 * Raise a credit note for the units coming back.
 *
 * The counterpart to a return or a cancellation. It references the original
 * invoice, and its own amounts are the exact share of that invoice the
 * returned units carried — which is why they are derived from the same frozen
 * line values rather than recomputed.
 */
export async function issueCreditNote(
  sellerOrderId: string,
  returned: Array<{ orderItemId: string; quantity: number }>,
  reason: string,
): Promise<{ ok: boolean; error?: string; invoiceId?: string }> {
  if (returned.length === 0) return { ok: false, error: 'Nothing to credit.' };

  const invoices = await collections.invoices();
  const original = toEntity(await invoices.findOne({ sellerOrderId, type: 'TAX_INVOICE' }));

  const sellerOrders = await collections.sellerOrders();
  const sellerOrder = toEntity(await sellerOrders.findOne({ _id: sellerOrderId }));
  if (!sellerOrder) return { ok: false, error: 'Seller order not found.' };

  const orders = await collections.orders();
  const order = toEntity(await orders.findOne({ _id: sellerOrder.orderId }));
  const sellers = await collections.sellers();
  const seller = toEntity(await sellers.findOne({ _id: sellerOrder.sellerId }));
  if (!order || !seller) return { ok: false, error: 'Order or seller not found.' };

  const itemCol = await collections.orderItems();
  const sourceItems = toEntities(
    await itemCol.find({ _id: { $in: returned.map((r) => r.orderItemId) } }).toArray(),
  );
  if (sourceItems.length === 0) return { ok: false, error: 'Those items are not on this order.' };

  // Scale each frozen line down to the quantity actually coming back.
  const scaled = sourceItems.map((item) => {
    const quantity = Math.min(
      returned.find((r) => r.orderItemId === item.id)?.quantity ?? item.quantity,
      item.quantity,
    );
    return scaleItem(item, quantity);
  });

  const note = buildInvoice({
    id: entityId('crn'),
    invoiceNumber: await nextInvoiceNumber(`${seller.code}-CN`, new Date()),
    type: 'CREDIT_NOTE',
    order,
    sellerOrder,
    seller,
    items: scaled,
    relatedInvoiceId: original?.id ?? null,
    note: reason,
  });

  await invoices.insertOne({ ...note, _id: note.id });
  return { ok: true, invoiceId: note.id };
}

/* ------------------------------------------------------------------ reads */

export async function getInvoice(invoiceId: string): Promise<Invoice | null> {
  const invoices = await collections.invoices();
  return toEntity(await invoices.findOne({ _id: invoiceId }));
}

/**
 * One invoice, three legitimate audiences: the customer who bought, the seller
 * who supplied, and staff with order access. Rather than three near-identical
 * routes, the authorisation is expressed once here and the caller gets null
 * for anyone else — which the page turns into a 404, so the document's
 * existence is not confirmed to a stranger.
 */
export async function getInvoiceFor(
  invoiceId: string,
  viewer: { userId: string; sellerId: string | null; canReadAnyOrder: boolean },
): Promise<Invoice | null> {
  const invoice = await getInvoice(invoiceId);
  if (!invoice) return null;

  if (viewer.canReadAnyOrder) return invoice;
  if (viewer.sellerId && invoice.sellerId === viewer.sellerId) return invoice;

  const orders = await collections.orders();
  const owns = await orders.countDocuments({ _id: invoice.orderId, userId: viewer.userId });
  return owns > 0 ? invoice : null;
}

export async function listInvoicesForOrder(orderId: string): Promise<Invoice[]> {
  const invoices = await collections.invoices();
  return toEntities(await invoices.find({ orderId }).sort({ issuedAt: 1 }).toArray());
}

/* --------------------------------------------------------------- building */

interface BuildArgs {
  id: string;
  invoiceNumber: string;
  type: Invoice['type'];
  order: Order;
  sellerOrder: SellerOrder;
  seller: Seller;
  items: OrderItem[];
  relatedInvoiceId: string | null;
  note?: string;
}

function buildInvoice(args: BuildArgs): Invoice {
  const { id, invoiceNumber, type, order, sellerOrder, seller, items, relatedInvoiceId } = args;

  const placeOfSupply = order.shippingAddress.state;
  // The supplier's registered state is what the delivery state is compared
  // against; the platform's own state is irrelevant to the seller's invoice.
  const sellerState = seller.kyc.registeredAddress.state;
  const isInterState = sellerState.trim().toLowerCase() !== placeOfSupply.trim().toLowerCase();

  const lines: InvoiceLine[] = items.map((item) => {
    const taxableValue = item.lineTotal - item.taxAmount;
    const split = splitFor(item.taxAmount, isInterState);

    return {
      description: `${item.brandName ? `${item.brandName} ` : ''}${item.productTitle} (${item.size}, ${item.colorLabel})`,
      hsnCode: item.hsnCode,
      sku: item.sku,
      quantity: item.quantity,
      unitPrice: item.unitMrp,
      discount: item.discount + item.couponDiscount,
      taxableValue,
      taxRatePercent: item.taxRatePercent,
      ...split,
      total: item.lineTotal,
    };
  });

  const taxBreakup: TaxLine[] = aggregateTaxLines(
    items.map((item) => ({
      ratePercent: item.taxRatePercent,
      taxableValue: item.lineTotal - item.taxAmount,
      ...splitFor(item.taxAmount, isInterState),
      total: item.taxAmount,
    })),
  );

  const subtotal = sumPaise(items.map((item) => item.lineSubtotal));
  const discount = sumPaise(items.map((item) => item.discount + item.couponDiscount));
  const taxableValue = sumPaise(lines.map((line) => line.taxableValue));
  const shippingFee = sumPaise(items.map((item) => item.shippingFee));
  const rawTotal = sumPaise(items.map((item) => item.lineTotal));

  // Invoices are presented to the rupee; the difference is shown rather than
  // hidden, because the figures below it must still add up.
  const total = roundToRupee(rawTotal);
  const roundOff = total - rawTotal;

  return {
    id,
    invoiceNumber,
    type,
    orderId: order.id,
    orderNumber: order.orderNumber,
    sellerOrderId: sellerOrder.id,
    sellerId: seller.id,
    sellerName: seller.legalName,
    sellerGstin: seller.kyc.gstin,
    sellerAddress: [
      seller.kyc.registeredAddress.line1,
      seller.kyc.registeredAddress.line2,
      `${seller.kyc.registeredAddress.city}, ${seller.kyc.registeredAddress.state} ${seller.kyc.registeredAddress.pincode}`,
    ]
      .filter(Boolean)
      .join(', '),
    buyerName: order.shippingAddress.fullName,
    buyerAddress: order.shippingAddress,
    placeOfSupply,
    isInterState,
    lines,
    subtotal,
    discount,
    taxableValue,
    taxBreakup,
    shippingFee,
    roundOff,
    total,
    amountInWords: amountInWords(total),
    issuedAt: new Date().toISOString(),
    relatedInvoiceId,
  };
}

function splitFor(taxAmount: number, isInterState: boolean) {
  if (isInterState) return { cgst: 0, sgst: 0, igst: taxAmount };
  const half = Math.floor(taxAmount / 2);
  return { cgst: taxAmount - half, sgst: half, igst: 0 };
}

/** A copy of the line covering only the units being credited. */
function scaleItem(item: OrderItem, quantity: number): OrderItem {
  if (quantity >= item.quantity) return item;
  const ratio = quantity / item.quantity;
  const scale = (value: number) => Math.round(value * ratio);

  return {
    ...item,
    quantity,
    lineMrp: scale(item.lineMrp),
    lineSubtotal: scale(item.lineSubtotal),
    discount: scale(item.discount),
    couponDiscount: scale(item.couponDiscount),
    shippingFee: scale(item.shippingFee),
    taxAmount: scale(item.taxAmount),
    lineTotal: scale(item.lineTotal),
  };
}

/** The platform's home state, for reference on the invoice footer. */
export const MARKETPLACE_STATE = PRICING.originState;
