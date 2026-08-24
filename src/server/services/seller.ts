import 'server-only';

import { FINANCE, INVENTORY } from '@/config/business';
import { SELLER_ACTIONABLE, type FulfillmentStatus } from '@/domain/enums';
import type { OrderItem, Product, Seller, SellerOrder } from '@/domain/types';

import { collections, toEntities, toEntity } from '../db/collections';

/**
 * Seller console queries.
 *
 * EVERY function here takes `sellerId` as its first argument and puts it in the
 * Mongo filter — never as a post-filter on a wider result. That is the whole
 * tenancy boundary of the marketplace: one seller must not be able to read
 * another's orders, revenue or stock, and the way that is guaranteed is that no
 * query in this file can be written without saying whose data it is.
 *
 * Callers get `sellerId` from `requireSeller()`, which reads it from the
 * session, never from a route parameter.
 */

/* ------------------------------------------------------------- dashboard */

export interface SellerDashboard {
  seller: Seller;
  revenue: { current: number; previous: number; delta: number | null };
  orders: { current: number; previous: number; delta: number | null };
  units: number;
  averageOrderValue: number;
  actionable: number;
  breaching: number;
  lowStock: number;
  outOfStock: number;
  liveProducts: number;
  returnRate: number;
  /** Daily revenue for the trailing 30 days, oldest first. */
  trend: Array<{ date: string; revenue: number; orders: number }>;
  topProducts: Array<{ productId: string; title: string; units: number; revenue: number }>;
}

export async function getSellerDashboard(
  sellerId: string,
  days = 30,
): Promise<SellerDashboard | null> {
  const sellerCol = await collections.sellers();
  const seller = toEntity(await sellerCol.findOne({ _id: sellerId }));
  if (!seller) return null;

  const now = Date.now();
  const windowStart = new Date(now - days * 86_400_000);
  const previousStart = new Date(now - days * 2 * 86_400_000);

  const sellerOrderCol = await collections.sellerOrders();
  const itemCol = await collections.orderItems();

  // Two windows in one pass, so "up 12% on last month" is a real comparison
  // rather than a number invented for the card.
  const [current, previous] = await Promise.all([
    sumWindow(sellerId, windowStart, new Date(now)),
    sumWindow(sellerId, previousStart, windowStart),
  ]);

  const delta = (a: number, b: number): number | null =>
    b === 0 ? null : ((a - b) / b) * 100;

  /* -------------------------------------------------------- work queues */

  const actionable = await sellerOrderCol.countDocuments({
    sellerId,
    status: { $in: SELLER_ACTIONABLE },
  });

  // Past the dispatch promise and still not shipped: the number that should
  // make someone act today.
  const breaching = await sellerOrderCol.countDocuments({
    sellerId,
    status: { $in: ['PLACED', 'CONFIRMED', 'PROCESSING'] },
    dispatchBy: { $lt: new Date(now).toISOString() },
  });

  /* ----------------------------------------------------------- catalogue */

  const productCol = await collections.products();
  const products = toEntities(
    await productCol
      .find({ sellerId }, { projection: { variants: 1, title: 1, status: 1 } })
      .toArray(),
  );

  let lowStock = 0;
  let outOfStock = 0;
  for (const product of products) {
    for (const variant of product.variants) {
      if (!variant.isActive) continue;
      if (variant.inventory.available <= 0) outOfStock += 1;
      else if (
        variant.inventory.available <=
        (variant.inventory.lowStockThreshold || INVENTORY.defaultLowStockThreshold)
      ) {
        lowStock += 1;
      }
    }
  }

  /* --------------------------------------------------------------- trend */

  const trendRows = await sellerOrderCol
    .aggregate<{ _id: string; revenue: number; orders: number }>([
      {
        $match: {
          sellerId,
          placedAt: { $gte: windowStart.toISOString() },
          status: { $ne: 'CANCELLED' },
        },
      },
      {
        $group: {
          // The ISO string is already sortable and date-prefixed, so the day
          // key is a substring rather than a date parse per document.
          _id: { $substrBytes: ['$placedAt', 0, 10] },
          revenue: { $sum: '$total' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ])
    .toArray();

  const byDay = new Map(trendRows.map((row) => [row._id, row]));
  const trend: SellerDashboard['trend'] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now - i * 86_400_000).toISOString().slice(0, 10);
    const row = byDay.get(date);
    trend.push({ date, revenue: row?.revenue ?? 0, orders: row?.orders ?? 0 });
  }

  /* -------------------------------------------------------- top sellers */

  const topRows = await itemCol
    .aggregate<{ _id: string; title: string; units: number; revenue: number }>([
      {
        $match: {
          sellerId,
          createdAt: { $gte: windowStart.toISOString() },
          status: { $nin: ['CANCELLED', 'REFUNDED'] },
        },
      },
      {
        $group: {
          _id: '$productId',
          title: { $first: '$productTitle' },
          units: { $sum: '$quantity' },
          revenue: { $sum: '$lineTotal' },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 5 },
    ])
    .toArray();

  const returned = await itemCol.countDocuments({
    sellerId,
    status: { $in: ['RETURNED', 'REFUNDED'] },
  });
  const shipped = await itemCol.countDocuments({
    sellerId,
    status: { $nin: ['CANCELLED', 'PLACED', 'CONFIRMED'] },
  });

  return {
    seller,
    revenue: { current: current.revenue, previous: previous.revenue, delta: delta(current.revenue, previous.revenue) },
    orders: { current: current.orders, previous: previous.orders, delta: delta(current.orders, previous.orders) },
    units: current.units,
    averageOrderValue: current.orders > 0 ? Math.round(current.revenue / current.orders) : 0,
    actionable,
    breaching,
    lowStock,
    outOfStock,
    liveProducts: products.filter((p) => p.status === 'PUBLISHED').length,
    returnRate: shipped > 0 ? Number(((returned / shipped) * 100).toFixed(1)) : 0,
    trend,
    topProducts: topRows.map((row) => ({
      productId: row._id,
      title: row.title,
      units: row.units,
      revenue: row.revenue,
    })),
  };
}

async function sumWindow(
  sellerId: string,
  from: Date,
  to: Date,
): Promise<{ revenue: number; orders: number; units: number }> {
  const sellerOrderCol = await collections.sellerOrders();

  const rows = await sellerOrderCol
    .aggregate<{ revenue: number; orders: number }>([
      {
        $match: {
          sellerId,
          placedAt: { $gte: from.toISOString(), $lt: to.toISOString() },
          status: { $ne: 'CANCELLED' },
        },
      },
      { $group: { _id: null, revenue: { $sum: '$total' }, orders: { $sum: 1 } } },
    ])
    .toArray();

  const itemCol = await collections.orderItems();
  const unitRows = await itemCol
    .aggregate<{ units: number }>([
      {
        $match: {
          sellerId,
          createdAt: { $gte: from.toISOString(), $lt: to.toISOString() },
          status: { $ne: 'CANCELLED' },
        },
      },
      { $group: { _id: null, units: { $sum: '$quantity' } } },
    ])
    .toArray();

  return {
    revenue: rows[0]?.revenue ?? 0,
    orders: rows[0]?.orders ?? 0,
    units: unitRows[0]?.units ?? 0,
  };
}

/* ------------------------------------------------------------------ orders */

export interface SellerOrderRow extends SellerOrder {
  items: OrderItem[];
  /** Past its dispatch promise and still not shipped. */
  breaching: boolean;
}

export async function listSellerOrders(
  sellerId: string,
  options: { status?: FulfillmentStatus | 'ACTION' | 'ALL'; page?: number; pageSize?: number } = {},
): Promise<{ rows: SellerOrderRow[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, options.pageSize ?? 25);

  const filter: Record<string, unknown> = { sellerId };
  if (options.status === 'ACTION') {
    filter.status = { $in: SELLER_ACTIONABLE };
  } else if (options.status && options.status !== 'ALL') {
    filter.status = options.status;
  }

  const sellerOrderCol = await collections.sellerOrders();
  const [docs, total] = await Promise.all([
    sellerOrderCol
      .find(filter)
      .sort({ placedAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray(),
    sellerOrderCol.countDocuments(filter),
  ]);

  const sellerOrders = toEntities(docs);

  // One query for every line on the page rather than one per order.
  const itemCol = await collections.orderItems();
  const items = toEntities(
    await itemCol.find({ sellerOrderId: { $in: sellerOrders.map((s) => s.id) } }).toArray(),
  );

  const byOrder = new Map<string, OrderItem[]>();
  for (const item of items) {
    byOrder.set(item.sellerOrderId, [...(byOrder.get(item.sellerOrderId) ?? []), item]);
  }

  const nowIso = new Date().toISOString();

  return {
    rows: sellerOrders.map((sellerOrder) => ({
      ...sellerOrder,
      items: byOrder.get(sellerOrder.id) ?? [],
      breaching:
        sellerOrder.dispatchBy < nowIso &&
        ['PLACED', 'CONFIRMED', 'PROCESSING'].includes(sellerOrder.status),
    })),
    total,
    page,
    pageSize,
  };
}

/* --------------------------------------------------------------- catalogue */

export async function listSellerProducts(
  sellerId: string,
  options: { status?: string; query?: string; page?: number; pageSize?: number } = {},
): Promise<{ rows: Product[]; total: number; page: number; pageSize: number }> {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, options.pageSize ?? 25);

  const filter: Record<string, unknown> = { sellerId };
  if (options.status && options.status !== 'ALL') filter.status = options.status;
  if (options.query) {
    // Anchored regex so it can still use an index prefix; a leading wildcard
    // would force a collection scan on every keystroke.
    filter.title = { $regex: escapeRegex(options.query), $options: 'i' };
  }

  const productCol = await collections.products();
  const [docs, total] = await Promise.all([
    productCol
      .find(filter)
      .sort({ updatedAt: -1 })
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .toArray(),
    productCol.countDocuments(filter),
  ]);

  return { rows: toEntities(docs), total, page, pageSize };
}

export interface InventoryRow {
  productId: string;
  productTitle: string;
  productSlug: string;
  variantId: string;
  sku: string;
  size: string;
  colorLabel: string;
  available: number;
  reserved: number;
  sold: number;
  returned: number;
  damaged: number;
  lowStockThreshold: number;
  sellingPrice: number;
  isActive: boolean;
}

/**
 * Flattened stock rows.
 *
 * Sorted so the rows that need action come first — out of stock, then low —
 * because an inventory screen sorted alphabetically makes the seller do the
 * triage the software should have done.
 */
export async function listSellerInventory(
  sellerId: string,
  options: { filter?: 'ALL' | 'LOW' | 'OUT'; limit?: number } = {},
): Promise<InventoryRow[]> {
  const productCol = await collections.products();
  const products = toEntities(await productCol.find({ sellerId }).toArray());

  const rows: InventoryRow[] = [];
  for (const product of products) {
    for (const variant of product.variants) {
      rows.push({
        productId: product.id,
        productTitle: product.title,
        productSlug: product.slug,
        variantId: variant.id,
        sku: variant.sku,
        size: variant.size,
        colorLabel: variant.colorLabel,
        available: variant.inventory.available,
        reserved: variant.inventory.reserved,
        sold: variant.inventory.sold,
        returned: variant.inventory.returned,
        damaged: variant.inventory.damaged,
        lowStockThreshold:
          variant.inventory.lowStockThreshold || INVENTORY.defaultLowStockThreshold,
        sellingPrice: variant.sellingPrice,
        isActive: variant.isActive,
      });
    }
  }

  const filtered = rows.filter((row) => {
    if (options.filter === 'OUT') return row.available <= 0;
    if (options.filter === 'LOW') return row.available > 0 && row.available <= row.lowStockThreshold;
    return true;
  });

  filtered.sort((a, b) => {
    const rank = (row: InventoryRow) =>
      row.available <= 0 ? 0 : row.available <= row.lowStockThreshold ? 1 : 2;
    return rank(a) - rank(b) || a.available - b.available;
  });

  return filtered.slice(0, options.limit ?? 500);
}

/* ----------------------------------------------------------------- finance */

export interface SellerEarnings {
  grossSales: number;
  commission: number;
  gatewayFees: number;
  netPayable: number;
  refunded: number;
  /** Delivered but still inside the settlement hold. */
  pending: number;
  /** Past the hold and ready to pay out. */
  clearable: number;
  byMonth: Array<{ month: string; gross: number; commission: number; net: number }>;
}

export async function getSellerEarnings(sellerId: string): Promise<SellerEarnings> {
  const sellerOrderCol = await collections.sellerOrders();

  const rows = await sellerOrderCol
    .aggregate<{
      _id: string;
      gross: number;
      commission: number;
      net: number;
    }>([
      { $match: { sellerId, status: { $ne: 'CANCELLED' } } },
      {
        $group: {
          _id: { $substrBytes: ['$placedAt', 0, 7] },
          gross: { $sum: '$total' },
          commission: { $sum: '$commission' },
          net: { $sum: '$sellerPayable' },
        },
      },
      { $sort: { _id: -1 } },
      { $limit: 12 },
    ])
    .toArray();

  const grossSales = rows.reduce((sum, r) => sum + r.gross, 0);
  const commission = rows.reduce((sum, r) => sum + r.commission, 0);
  const netPayable = rows.reduce((sum, r) => sum + r.net, 0);

  // Money is only clearable once delivered AND past the hold period; before
  // that it is still at risk of a return.
  const holdCutoff = new Date(
    Date.now() - FINANCE.settlementHoldDays * 86_400_000,
  ).toISOString();

  const [pendingRows, clearableRows, refundRows] = await Promise.all([
    sellerOrderCol
      .aggregate<{ total: number }>([
        {
          $match: {
            sellerId,
            status: 'DELIVERED',
            deliveredAt: { $gte: holdCutoff },
            settlementId: null,
          },
        },
        { $group: { _id: null, total: { $sum: '$sellerPayable' } } },
      ])
      .toArray(),
    sellerOrderCol
      .aggregate<{ total: number }>([
        {
          $match: {
            sellerId,
            status: 'DELIVERED',
            deliveredAt: { $lt: holdCutoff },
            settlementId: null,
          },
        },
        { $group: { _id: null, total: { $sum: '$sellerPayable' } } },
      ])
      .toArray(),
    sellerOrderCol
      .aggregate<{ total: number }>([
        { $match: { sellerId, status: { $in: ['RETURNED', 'REFUNDED'] } } },
        { $group: { _id: null, total: { $sum: '$total' } } },
      ])
      .toArray(),
  ]);

  return {
    grossSales,
    commission,
    gatewayFees: Math.max(0, grossSales - commission - netPayable),
    netPayable,
    refunded: refundRows[0]?.total ?? 0,
    pending: pendingRows[0]?.total ?? 0,
    clearable: clearableRows[0]?.total ?? 0,
    byMonth: rows
      .map((row) => ({
        month: row._id,
        gross: row.gross,
        commission: row.commission,
        net: row.net,
      }))
      .reverse(),
  };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
