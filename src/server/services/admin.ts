import 'server-only';

import { FINANCE } from '@/config/business';
import type { FulfillmentStatus } from '@/domain/enums';
import type { Order, Product, Seller, User } from '@/domain/types';

import { collections, toEntities } from '../db/collections';

/**
 * Platform-wide queries for the admin console.
 *
 * The counterpart to `services/seller.ts`, and the difference is the whole
 * point: nothing here is scoped to a seller. Every function in this file is
 * therefore behind a permission check at the call site — `requirePermission`
 * decides who may read it, and the queries themselves assume the caller has
 * already been authorised.
 *
 * Aggregations run in MongoDB rather than in Node. Pulling 1,400 orders across
 * the wire to sum them in JavaScript works at this size and stops working at
 * the size this is meant to grow into.
 */

/* -------------------------------------------------------------- dashboard */

export interface AdminDashboard {
  gmv: { current: number; previous: number; delta: number | null };
  orders: { current: number; previous: number; delta: number | null };
  averageOrderValue: number;
  commission: number;
  refunds: number;
  customers: number;
  newCustomers: number;
  activeSellers: number;
  pendingSellers: number;
  liveProducts: number;
  pendingProducts: number;
  openReturns: number;
  failedPayments: number;
  trend: Array<{ date: string; revenue: number; orders: number }>;
  topSellers: Array<{ sellerId: string; name: string; gmv: number; orders: number }>;
  topCategories: Array<{ categoryId: string; name: string; revenue: number; units: number }>;
}

export async function getAdminDashboard(days = 30): Promise<AdminDashboard> {
  const now = Date.now();
  const windowStart = new Date(now - days * 86_400_000).toISOString();
  const previousStart = new Date(now - days * 2 * 86_400_000).toISOString();

  const [orderCol, sellerOrderCol, itemCol, userCol, sellerCol, productCol, returnCol, paymentCol] =
    await Promise.all([
      collections.orders(),
      collections.sellerOrders(),
      collections.orderItems(),
      collections.users(),
      collections.sellers(),
      collections.products(),
      collections.returns(),
      collections.payments(),
    ]);

  const window = async (from: string, to: string) => {
    const rows = await orderCol
      .aggregate<{ gmv: number; orders: number }>([
        {
          $match: {
            placedAt: { $gte: from, $lt: to },
            // Cancelled orders are not revenue, and counting them inflates
            // every number downstream.
            status: { $ne: 'CANCELLED' },
          },
        },
        { $group: { _id: null, gmv: { $sum: '$pricing.payable' }, orders: { $sum: 1 } } },
      ])
      .toArray();
    return { gmv: rows[0]?.gmv ?? 0, orders: rows[0]?.orders ?? 0 };
  };

  const nowIso = new Date(now).toISOString();
  const [current, previous] = await Promise.all([
    window(windowStart, nowIso),
    window(previousStart, windowStart),
  ]);

  const delta = (a: number, b: number): number | null => (b === 0 ? null : ((a - b) / b) * 100);

  /* ------------------------------------------------------------ counters */

  const [
    customers,
    newCustomers,
    activeSellers,
    pendingSellers,
    liveProducts,
    pendingProducts,
    openReturns,
    failedPayments,
  ] = await Promise.all([
    userCol.countDocuments({ roles: 'CUSTOMER' }),
    userCol.countDocuments({ roles: 'CUSTOMER', createdAt: { $gte: windowStart } }),
    sellerCol.countDocuments({ status: 'ACTIVE' }),
    sellerCol.countDocuments({ status: { $in: ['ONBOARDING', 'KYC_SUBMITTED', 'KYC_PENDING'] } }),
    productCol.countDocuments({ status: 'PUBLISHED' }),
    productCol.countDocuments({ status: { $in: ['SUBMITTED', 'PENDING_REVIEW'] } }),
    returnCol.countDocuments({ status: { $in: ['RETURN_REQUESTED', 'RETURN_APPROVED'] } }),
    paymentCol.countDocuments({ status: 'FAILED', createdAt: { $gte: windowStart } }),
  ]);

  /* --------------------------------------------------------- commission */

  const commissionRows = await sellerOrderCol
    .aggregate<{ commission: number }>([
      { $match: { placedAt: { $gte: windowStart }, status: { $ne: 'CANCELLED' } } },
      { $group: { _id: null, commission: { $sum: '$commission' } } },
    ])
    .toArray();

  const refundRows = await sellerOrderCol
    .aggregate<{ total: number }>([
      {
        $match: {
          placedAt: { $gte: windowStart },
          status: { $in: ['RETURNED', 'REFUNDED'] },
        },
      },
      { $group: { _id: null, total: { $sum: '$total' } } },
    ])
    .toArray();

  /* -------------------------------------------------------------- trend */

  const trendRows = await orderCol
    .aggregate<{ _id: string; revenue: number; orders: number }>([
      { $match: { placedAt: { $gte: windowStart }, status: { $ne: 'CANCELLED' } } },
      {
        $group: {
          _id: { $substrBytes: ['$placedAt', 0, 10] },
          revenue: { $sum: '$pricing.payable' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ])
    .toArray();

  const byDay = new Map(trendRows.map((row) => [row._id, row]));
  const trend: AdminDashboard['trend'] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(now - i * 86_400_000).toISOString().slice(0, 10);
    const row = byDay.get(date);
    trend.push({ date, revenue: row?.revenue ?? 0, orders: row?.orders ?? 0 });
  }

  /* -------------------------------------------------------- leaderboards */

  const topSellerRows = await sellerOrderCol
    .aggregate<{ _id: string; name: string; gmv: number; orders: number }>([
      { $match: { placedAt: { $gte: windowStart }, status: { $ne: 'CANCELLED' } } },
      {
        $group: {
          _id: '$sellerId',
          name: { $first: '$sellerName' },
          gmv: { $sum: '$total' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { gmv: -1 } },
      { $limit: 6 },
    ])
    .toArray();

  const topCategoryRows = await itemCol
    .aggregate<{ _id: string; revenue: number; units: number }>([
      {
        $match: {
          createdAt: { $gte: windowStart },
          status: { $nin: ['CANCELLED', 'REFUNDED'] },
        },
      },
      {
        $group: {
          _id: '$categoryId',
          revenue: { $sum: '$lineTotal' },
          units: { $sum: '$quantity' },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 6 },
    ])
    .toArray();

  const categoryCol = await collections.categories();
  const categories = toEntities(
    await categoryCol.find({ _id: { $in: topCategoryRows.map((r) => r._id) } }).toArray(),
  );
  const categoryName = new Map(categories.map((c) => [c.id, c.name]));

  return {
    gmv: { current: current.gmv, previous: previous.gmv, delta: delta(current.gmv, previous.gmv) },
    orders: {
      current: current.orders,
      previous: previous.orders,
      delta: delta(current.orders, previous.orders),
    },
    averageOrderValue: current.orders > 0 ? Math.round(current.gmv / current.orders) : 0,
    commission: commissionRows[0]?.commission ?? 0,
    refunds: refundRows[0]?.total ?? 0,
    customers,
    newCustomers,
    activeSellers,
    pendingSellers,
    liveProducts,
    pendingProducts,
    openReturns,
    failedPayments,
    trend,
    topSellers: topSellerRows.map((row) => ({
      sellerId: row._id,
      name: row.name,
      gmv: row.gmv,
      orders: row.orders,
    })),
    topCategories: topCategoryRows.map((row) => ({
      categoryId: row._id,
      name: categoryName.get(row._id) ?? 'Uncategorised',
      revenue: row.revenue,
      units: row.units,
    })),
  };
}

/* ------------------------------------------------------------------ lists */

export interface Paged<T> {
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
}

function paging(options: { page?: number; pageSize?: number }) {
  const page = Math.max(1, options.page ?? 1);
  const pageSize = Math.min(100, options.pageSize ?? 25);
  return { page, pageSize, skip: (page - 1) * pageSize };
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export async function listAllOrders(
  options: { status?: string; query?: string; page?: number; pageSize?: number } = {},
): Promise<Paged<Order>> {
  const { page, pageSize, skip } = paging(options);

  const filter: Record<string, unknown> = {};
  if (options.status && options.status !== 'ALL') filter.status = options.status as FulfillmentStatus;
  if (options.query) filter.orderNumber = { $regex: escapeRegex(options.query), $options: 'i' };

  const orders = await collections.orders();
  const [docs, total] = await Promise.all([
    orders.find(filter).sort({ placedAt: -1 }).skip(skip).limit(pageSize).toArray(),
    orders.countDocuments(filter),
  ]);

  return { rows: toEntities(docs), total, page, pageSize };
}

export async function listSellers(
  options: { status?: string; query?: string; page?: number; pageSize?: number } = {},
): Promise<Paged<Seller>> {
  const { page, pageSize, skip } = paging(options);

  const filter: Record<string, unknown> = {};
  // Applications: every state that is still waiting for a decision.
  if (options.status === 'PENDING') filter.status = { $in: ['ONBOARDING', 'KYC_SUBMITTED', 'KYC_PENDING'] };
  else if (options.status && options.status !== 'ALL') filter.status = options.status;
  if (options.query) filter.displayName = { $regex: escapeRegex(options.query), $options: 'i' };

  const sellers = await collections.sellers();
  const [docs, total] = await Promise.all([
    sellers
      .find(filter)
      // Applications oldest first, so nobody waits longest by accident.
      .sort(options.status === 'PENDING' ? { joinedAt: 1 } : { 'metrics.lifetimeGmv': -1 })
      .skip(skip)
      .limit(pageSize)
      .toArray(),
    sellers.countDocuments(filter),
  ]);

  return { rows: toEntities(docs), total, page, pageSize };
}

export async function listUsers(
  options: { role?: string; query?: string; page?: number; pageSize?: number } = {},
): Promise<Paged<User>> {
  const { page, pageSize, skip } = paging(options);

  const filter: Record<string, unknown> = {};
  if (options.role && options.role !== 'ALL') filter.roles = options.role;
  if (options.query) {
    filter.$or = [
      { fullName: { $regex: escapeRegex(options.query), $options: 'i' } },
      { email: { $regex: escapeRegex(options.query), $options: 'i' } },
    ];
  }

  const users = await collections.users();
  const [docs, total] = await Promise.all([
    users
      .find(filter, {
        // The hash never leaves the database, not even to a super admin.
        projection: { passwordHash: 0 },
      })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .toArray(),
    users.countDocuments(filter),
  ]);

  return { rows: toEntities(docs), total, page, pageSize };
}

export async function listAllProducts(
  options: { status?: string; query?: string; page?: number; pageSize?: number } = {},
): Promise<Paged<Product>> {
  const { page, pageSize, skip } = paging(options);

  const filter: Record<string, unknown> = {};
  if (options.status && options.status !== 'ALL') filter.status = options.status;
  if (options.query) filter.title = { $regex: escapeRegex(options.query), $options: 'i' };

  const products = await collections.products();
  const [docs, total] = await Promise.all([
    products.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(pageSize).toArray(),
    products.countDocuments(filter),
  ]);

  return { rows: toEntities(docs), total, page, pageSize };
}

/* ---------------------------------------------------------------- finance */

export interface PlatformFinance {
  gmv: number;
  commission: number;
  gatewayFees: number;
  refunded: number;
  netRevenue: number;
  payableToSellers: number;
  byMonth: Array<{ month: string; gmv: number; commission: number; refunds: number }>;
}

export async function getPlatformFinance(): Promise<PlatformFinance> {
  const sellerOrders = await collections.sellerOrders();

  const rows = await sellerOrders
    .aggregate<{
      _id: string;
      gmv: number;
      commission: number;
      payable: number;
      refunds: number;
    }>([
      {
        $group: {
          _id: { $substrBytes: ['$placedAt', 0, 7] },
          gmv: {
            $sum: { $cond: [{ $eq: ['$status', 'CANCELLED'] }, 0, '$total'] },
          },
          commission: {
            $sum: { $cond: [{ $eq: ['$status', 'CANCELLED'] }, 0, '$commission'] },
          },
          payable: {
            $sum: { $cond: [{ $eq: ['$status', 'CANCELLED'] }, 0, '$sellerPayable'] },
          },
          refunds: {
            $sum: {
              $cond: [{ $in: ['$status', ['RETURNED', 'REFUNDED']] }, '$total', 0],
            },
          },
        },
      },
      { $sort: { _id: -1 } },
      { $limit: 12 },
    ])
    .toArray();

  const gmv = rows.reduce((sum, r) => sum + r.gmv, 0);
  const commission = rows.reduce((sum, r) => sum + r.commission, 0);
  const payableToSellers = rows.reduce((sum, r) => sum + r.payable, 0);
  const refunded = rows.reduce((sum, r) => sum + r.refunds, 0);

  return {
    gmv,
    commission,
    gatewayFees: Math.max(0, gmv - commission - payableToSellers),
    refunded,
    // What the platform actually keeps: commission, less what it refunded.
    netRevenue: commission - Math.round((refunded * FINANCE.defaultCommissionPercent) / 100),
    payableToSellers,
    byMonth: rows
      .map((row) => ({
        month: row._id,
        gmv: row.gmv,
        commission: row.commission,
        refunds: row.refunds,
      }))
      .reverse(),
  };
}
