import 'server-only';

import type { OptionalUnlessRequiredId } from 'mongodb';

import { getDb } from '../db/client';
import { COLLECTIONS, type Doc, toDoc } from '../db/collections';
import { ensureIndexes, type IndexFailure } from '../db/indexes';
import { hashPassword } from '../auth/password';
import {
  DEMO_PASSWORD,
  generateBanners,
  generateBrands,
  generateCategories,
  generateCoupons,
  generateCustomers,
  generateHomeSections,
  generateProducts,
  generateReviews,
  generateRoles,
  generateSellers,
  generateStaff,
} from './generate';
import { generateEngagement } from './engagement';
import { generateOrders } from './orders';
import { generateReturns } from './returns';
import { generateShipments } from './shipments';
import { generateCmsPages } from './pages';

/**
 * Seed the database.
 *
 * Deliberately destructive: it drops the collections it owns and rebuilds them
 * from scratch. A seeder that tries to merge into existing data ends up with
 * half-migrated records that match neither the old shape nor the new one, and
 * debugging that costs more than a reseed.
 *
 * Indexes are created AFTER the inserts. Building a unique index on a populated
 * collection is one pass; maintaining it across 6,000 inserts is 6,000 updates.
 * It also means a duplicate slug in generated data fails loudly at index
 * creation rather than being silently rejected halfway through the run.
 */

export interface SeedReport {
  counts: Record<string, number>;
  durationMs: number;
  credentials: { role: string; email: string; password: string }[];
  /**
   * Indexes that could not be built. A failure here usually means the
   * generated data violates a constraint the schema declares -- a duplicate
   * slug or SKU -- so it is surfaced rather than logged and forgotten.
   */
  indexFailures: IndexFailure[];
}

/** Collections the seeder owns. Anything else in the database is left alone. */
const OWNED = [
  COLLECTIONS.users,
  COLLECTIONS.addresses,
  COLLECTIONS.roles,
  COLLECTIONS.sessions,
  COLLECTIONS.sellers,
  COLLECTIONS.sellerLocations,
  COLLECTIONS.sellerFollows,
  COLLECTIONS.commissionPlans,
  COLLECTIONS.categories,
  COLLECTIONS.brands,
  COLLECTIONS.products,
  COLLECTIONS.carts,
  COLLECTIONS.wishlists,
  COLLECTIONS.coupons,
  COLLECTIONS.couponRedemptions,
  COLLECTIONS.promotions,
  COLLECTIONS.orders,
  COLLECTIONS.sellerOrders,
  COLLECTIONS.orderItems,
  COLLECTIONS.payments,
  COLLECTIONS.refunds,
  COLLECTIONS.invoices,
  COLLECTIONS.shipments,
  COLLECTIONS.manifests,
  COLLECTIONS.returns,
  COLLECTIONS.exchanges,
  COLLECTIONS.reviews,
  COLLECTIONS.sellerReviews,
  COLLECTIONS.questions,
  COLLECTIONS.notifications,
  COLLECTIONS.supportTickets,
  COLLECTIONS.helpArticles,
  COLLECTIONS.settlements,
  COLLECTIONS.homeSections,
  COLLECTIONS.banners,
  COLLECTIONS.cmsPages,
  COLLECTIONS.campaigns,
  COLLECTIONS.navigation,
  COLLECTIONS.auditLogs,
  COLLECTIONS.counters,
  COLLECTIONS.sagas,
  COLLECTIONS.webhookEvents,
  COLLECTIONS.activity,
];

export async function seedDatabase(
  log: (message: string) => void = () => {},
): Promise<SeedReport> {
  const started = Date.now();
  const db = await getDb();
  const now = new Date();

  log('Dropping existing collections...');
  for (const name of OWNED) {
    await db.collection(name).drop().catch(() => undefined);
  }

  // One hash reused across demo accounts: scrypt is intentionally slow, and
  // hashing 60 identical passwords would dominate the seed time for no benefit.
  log('Hashing demo password...');
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  log('Generating taxonomy and brands...');
  const roles = generateRoles();
  const categories = generateCategories(now);
  const brands = generateBrands(now);

  log('Generating stores...');
  const { sellers, locations, owners } = generateSellers(
    passwordHash,
    categories.map((c) => c.id),
    now,
  );

  log('Generating people...');
  const staff = generateStaff(passwordHash, now);
  const { customers, addresses } = generateCustomers(passwordHash, now);
  const users = [...staff, ...owners, ...customers];

  log('Generating catalogue...');
  const products = generateProducts({ categories, brands, sellers }, now);

  log('Generating reviews...');
  const reviews = generateReviews(products, customers, now);

  log('Generating a year of order history...');
  const history = generateOrders({
    products,
    sellers,
    customers,
    addresses,
    now,
    count: 1400,
  });

  log('Generating returns and refunds...');
  const postPurchase = generateReturns({
    orders: history.orders,
    sellerOrders: history.sellerOrders,
    items: history.items,
    now,
  });
  for (const item of history.items) {
    const returnId = postPurchase.itemReturnIds[item.id];
    if (returnId) {
      item.returnId = returnId;
      continue;
    }

    /*
     * A line claiming to be returned with no return behind it is broken data:
     * the order says "Returned" and there is nothing to open. That happens when
     * the generated return timeline would have run past the seed clock, so the
     * request was not created. Put the line back to DELIVERED rather than
     * leaving the two disagreeing.
     */
    if (item.status === 'RETURNED' || item.status === 'REFUNDED') {
      item.status = 'DELIVERED';
      item.returnedQuantity = 0;
    }
  }

  log('Generating parcels and manifests...');
  const fulfilment = generateShipments({
    orders: history.orders,
    sellerOrders: history.sellerOrders,
    items: history.items,
    locations,
    now,
  });

  // Stamp each item with the parcel that carried it, so the order page can join
  // the two without a second lookup.
  for (const item of history.items) {
    const shipmentId = fulfilment.itemShipmentIds[item.id];
    if (shipmentId) item.shipmentId = shipmentId;
  }
  for (const sellerOrder of history.sellerOrders) {
    const own = fulfilment.shipments.filter((s) => s.sellerOrderId === sellerOrder.id);
    if (own.length > 0) sellerOrder.shipmentIds = own.map((s) => s.id);
  }

  log('Generating notifications and support tickets...');
  const engagement = generateEngagement({
    orders: history.orders,
    items: history.items,
    customers,
    staff,
    now,
  });

  log('Generating offers and content...');
  const marketingUser = staff.find((u) => u.roles.includes('MARKETING_MANAGER')) ?? staff[0]!;
  const coupons = generateCoupons(categories, sellers, marketingUser.id, now);
  const homeSections = generateHomeSections(now);
  const banners = generateBanners(now);
  const cmsPages = generateCmsPages(marketingUser.id, now);

  /* ------------------------------------------------- derived aggregates */

  // Counts shown on category tiles, brand pages and the seller console are
  // stored rather than computed per request: they change on publish, which is
  // rare, and they are read on every listing page, which is not.
  log('Rolling up counts...');
  const productsByCategory = new Map<string, number>();
  const productsByBrand = new Map<string, number>();
  const productsBySeller = new Map<string, number>();
  const ratingByBrand = new Map<string, { total: number; count: number }>();

  const categoryById = new Map(categories.map((c) => [c.id, c]));

  for (const product of products) {
    // Only LIVE listings count. A category tile promising 118 styles that opens
    // on 104 is a small lie, and it is the kind that erodes trust in every
    // other number on the page.
    if (product.status !== 'PUBLISHED') continue;

    productsByBrand.set(product.brandId, (productsByBrand.get(product.brandId) ?? 0) + 1);
    productsBySeller.set(product.sellerId, (productsBySeller.get(product.sellerId) ?? 0) + 1);

    // A product counts towards its leaf category and every ancestor, which is
    // what a shopper expects when a department says "1,240 items".
    const leaf = categoryById.get(product.categoryId);
    if (leaf) {
      for (const slug of leaf.path) {
        const ancestor = categories.find((c) => c.slug === slug);
        if (ancestor) {
          productsByCategory.set(ancestor.id, (productsByCategory.get(ancestor.id) ?? 0) + 1);
        }
      }
    }

    if (product.rating.count > 0) {
      const entry = ratingByBrand.get(product.brandId) ?? { total: 0, count: 0 };
      entry.total += product.rating.average * product.rating.count;
      entry.count += product.rating.count;
      ratingByBrand.set(product.brandId, entry);
    }
  }

  for (const category of categories) {
    category.productCount = productsByCategory.get(category.id) ?? 0;
  }

  for (const brand of brands) {
    brand.productCount = productsByBrand.get(brand.id) ?? 0;
    const rating = ratingByBrand.get(brand.id);
    brand.averageRating = rating && rating.count > 0
      ? Number((rating.total / rating.count).toFixed(1))
      : 0;
    brand.categoryIds = Array.from(
      new Set(
        products
          .filter((p) => p.brandId === brand.id)
          .map((p) => p.categoryId),
      ),
    );
  }

  for (const seller of sellers) {
    // `productCount` is everything the seller has, live or not; `liveProductCount`
    // is what shoppers can see. The seller console shows both and they differ.
    seller.metrics.productCount = products.filter((p) => p.sellerId === seller.id).length;
    seller.metrics.liveProductCount = productsBySeller.get(seller.id) ?? 0;
  }

  // Seller metrics are derived from the generated history, so the number on a
  // store page and the number in its console are the same number.
  const ordersBySeller = new Map<string, { orders: number; gmv: number }>();
  for (const sellerOrder of history.sellerOrders) {
    const entry = ordersBySeller.get(sellerOrder.sellerId) ?? { orders: 0, gmv: 0 };
    entry.orders += 1;
    if (sellerOrder.status !== 'CANCELLED') entry.gmv += sellerOrder.total;
    ordersBySeller.set(sellerOrder.sellerId, entry);
  }

  for (const seller of sellers) {
    const entry = ordersBySeller.get(seller.id);
    seller.metrics.orderCount = entry?.orders ?? 0;
    seller.metrics.lifetimeGmv = entry?.gmv ?? 0;
  }

  /* ------------------------------------------------------------ persist */

  const insert = async <T extends { id: string }>(name: string, docs: T[]): Promise<number> => {
    if (docs.length === 0) return 0;
    // `toDoc` always supplies `_id`, but TypeScript cannot prove that through
    // the generic parameter, so the assertion is confined to this one line.
    const rows = docs.map(toDoc) as OptionalUnlessRequiredId<Doc<T>>[];
    // Unordered so one bad document does not abort the rest of the batch.
    await db.collection<Doc<T>>(name).insertMany(rows, { ordered: false });
    return docs.length;
  };

  log('Writing to MongoDB...');
  const counts: Record<string, number> = {};
  counts.roles = await insert(COLLECTIONS.roles, roles);
  counts.categories = await insert(COLLECTIONS.categories, categories);
  counts.brands = await insert(COLLECTIONS.brands, brands);
  counts.sellers = await insert(COLLECTIONS.sellers, sellers);
  counts.sellerLocations = await insert(COLLECTIONS.sellerLocations, locations);
  counts.users = await insert(COLLECTIONS.users, users);
  counts.addresses = await insert(COLLECTIONS.addresses, addresses);
  counts.products = await insert(COLLECTIONS.products, products);
  counts.reviews = await insert(COLLECTIONS.reviews, reviews);
  counts.coupons = await insert(COLLECTIONS.coupons, coupons);
  counts.orders = await insert(COLLECTIONS.orders, history.orders);
  counts.sellerOrders = await insert(COLLECTIONS.sellerOrders, history.sellerOrders);
  counts.orderItems = await insert(COLLECTIONS.orderItems, history.items);
  counts.payments = await insert(COLLECTIONS.payments, history.payments);
  // Generated all along but never persisted, which left the returns queue and
  // /account/returns permanently empty and made every settlement show a zero
  // return debit.
  counts.returns = await insert(COLLECTIONS.returns, postPurchase.returns);
  counts.refunds = await insert(COLLECTIONS.refunds, postPurchase.refunds);
  counts.shipments = await insert(COLLECTIONS.shipments, fulfilment.shipments);
  counts.manifests = await insert(COLLECTIONS.manifests, fulfilment.manifests);
  counts.notifications = await insert(COLLECTIONS.notifications, engagement.notifications);
  counts.supportTickets = await insert(COLLECTIONS.supportTickets, engagement.tickets);
  counts.homeSections = await insert(COLLECTIONS.homeSections, homeSections);
  counts.banners = await insert(COLLECTIONS.banners, banners);
  counts.cmsPages = await insert(COLLECTIONS.cmsPages, cmsPages);

  counts.variants = products.reduce((sum, p) => sum + p.variants.length, 0);

  log('Building indexes...');
  const indexFailures = await ensureIndexes();

  /*
   * Settlements are produced by the REAL service rather than generated.
   *
   * A hand-built settlement fixture would drift from what `runSettlement`
   * actually produces the first time the arithmetic changes, and the demo
   * would then show figures the code can no longer generate. Running it for
   * each seller costs a second and guarantees the two agree.
   */
  /*
   * Invoices, like settlements, come from the real service.
   *
   * They are normally raised at dispatch by `generateLabel`, which the seeded
   * shipments bypass — so without this every historical order has a dead
   * "Invoice" link. Issuing them here keeps the documents identical to the ones
   * a live dispatch produces, numbering included.
   */
  log('Issuing invoices for dispatched orders...');
  const { issueInvoice } = await import('../services/invoices');
  const dispatched = history.sellerOrders.filter((sellerOrder) =>
    ['PACKED', 'READY_FOR_PICKUP', 'SHIPPED', 'IN_TRANSIT', 'OUT_FOR_DELIVERY', 'DELIVERED',
     'RETURN_REQUESTED', 'RETURN_APPROVED', 'RETURN_PICKUP', 'RETURNED', 'REFUND_INITIATED',
     'REFUNDED'].includes(sellerOrder.status),
  );
  let invoiceCount = 0;
  for (const sellerOrder of dispatched) {
    const result = await issueInvoice(sellerOrder.id);
    if (result.ok) invoiceCount += 1;
  }
  counts.invoices = invoiceCount;

  log('Running settlements...');
  const { runSettlement } = await import('../services/settlements');
  let settlementCount = 0;
  for (const seller of sellers) {
    const result = await runSettlement(seller.id);
    if (result.ok && result.settlementId) settlementCount += 1;
  }
  counts.settlements = settlementCount;

  return {
    counts,
    indexFailures,
    durationMs: Date.now() - started,
    credentials: [
      { role: 'Super admin', email: 'superadmin@vestra.test', password: DEMO_PASSWORD },
      { role: 'Admin', email: 'admin@vestra.test', password: DEMO_PASSWORD },
      { role: 'Operations', email: 'ops@vestra.test', password: DEMO_PASSWORD },
      { role: 'Finance', email: 'finance@vestra.test', password: DEMO_PASSWORD },
      { role: 'Support', email: 'support@vestra.test', password: DEMO_PASSWORD },
      { role: 'Catalogue manager', email: 'catalog@vestra.test', password: DEMO_PASSWORD },
      { role: 'Marketing manager', email: 'marketing@vestra.test', password: DEMO_PASSWORD },
      { role: 'Seller (Mora Label)', email: 'mora01@seller.vestra.test', password: DEMO_PASSWORD },
      { role: 'Seller (Saanjh)', email: 'snjh01@seller.vestra.test', password: DEMO_PASSWORD },
      { role: 'Customer', email: 'ananya.iyer@example.com', password: DEMO_PASSWORD },
    ],
  };
}
