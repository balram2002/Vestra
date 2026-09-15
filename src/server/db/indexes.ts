import 'server-only';

import type { IndexDescription } from 'mongodb';

import { getDb } from './client';
import { COLLECTIONS, type CollectionName } from './collections';

/**
 * Index definitions.
 *
 * These are part of the schema, not an optimisation afterthought. Two kinds
 * appear here and they carry different weight:
 *
 *  - UNIQUE indexes are correctness constraints. Slug collisions, duplicate
 *    SKUs and double-applied coupons are prevented by the database rather than
 *    by application checks that race under concurrency. This is how the system
 *    stays consistent without multi-document transactions.
 *
 *  - TTL indexes are lifecycle policy. Guest bags and expired sessions sweep
 *    themselves rather than accumulating until someone writes a cron job.
 *
 * Partial filters are used wherever a field is legitimately absent (a guest
 * bag has no userId), because a plain unique index treats every missing value
 * as the same null and would reject the second guest.
 */
const INDEXES: Partial<Record<CollectionName, IndexDescription[]>> = {
  /* ------------------------------------------------------------ identity */
  [COLLECTIONS.rateLimits]: [
    // Each window document carries its own end, and Mongo deletes it then.
    { key: { expiresAt: 1 }, expireAfterSeconds: 0, name: 'ttl_window' },
  ],
  [COLLECTIONS.authChallenges]: [
    { key: { userId: 1, purpose: 1, consumedAt: 1, createdAt: -1 }, name: 'by_user_purpose' },
    // A day after its code expires the record goes: long enough to look at
    // during an incident, short enough that codes never accumulate.
    { key: { purgeAt: 1 }, expireAfterSeconds: 0, name: 'ttl_purge' },
  ],

  [COLLECTIONS.users]: [
    { key: { googleSubject: 1 }, unique: true, name: 'uniq_google_subject', partialFilterExpression: { googleSubject: { $type: 'string' } } },
    { key: { email: 1 }, unique: true, name: 'uniq_email' },
    {
      key: { phone: 1 },
      unique: true,
      // Partial, not sparse: a sparse index still treats an explicit `null` as a
      // value, so every staff account without a phone would collide.
      partialFilterExpression: { phone: { $type: 'string' } },
      name: 'uniq_phone',
    },
    { key: { roles: 1, status: 1 }, name: 'by_role_status' },
    { key: { createdAt: -1 }, name: 'by_created' },
  ],
  [COLLECTIONS.addresses]: [
    { key: { userId: 1, isDefault: -1 }, name: 'by_user' },
    { key: { pincode: 1 }, name: 'by_pincode' },
  ],
  [COLLECTIONS.sessions]: [
    { key: { token: 1 }, unique: true, name: 'uniq_token' },
    { key: { userId: 1 }, name: 'by_user' },
    // Mongo sweeps expired sessions on its own; no logout job required.
    { key: { expiresAt: 1 }, expireAfterSeconds: 0, name: 'ttl_expiry' },
  ],

  /* ------------------------------------------------------------- sellers */
  [COLLECTIONS.sellers]: [
    { key: { slug: 1 }, unique: true, name: 'uniq_slug' },
    { key: { slugHistory: 1 }, name: 'by_slug_history' },
    { key: { userId: 1 }, name: 'by_user' },
    { key: { status: 1, createdAt: -1 }, name: 'by_status' },
    { key: { 'rating.average': -1 }, name: 'by_rating' },
  ],
  [COLLECTIONS.sellerLocations]: [{ key: { sellerId: 1 }, name: 'by_seller' }],
  [COLLECTIONS.sellerFollows]: [
    { key: { userId: 1, sellerId: 1 }, unique: true, name: 'uniq_follow' },
    { key: { sellerId: 1 }, name: 'by_seller' },
  ],
  [COLLECTIONS.commissionPlans]: [{ key: { isDefault: -1 }, name: 'by_default' }],

  /* ----------------------------------------------------------- catalogue */
  [COLLECTIONS.categories]: [
    { key: { slug: 1 }, unique: true, name: 'uniq_slug' },
    { key: { slugHistory: 1 }, name: 'by_slug_history' },
    { key: { parentId: 1, position: 1 }, name: 'by_parent' },
    { key: { path: 1 }, name: 'by_path' },
    { key: { isActive: 1, featured: -1 }, name: 'by_featured' },
  ],
  [COLLECTIONS.brands]: [
    { key: { slug: 1 }, unique: true, name: 'uniq_slug' },
    { key: { slugHistory: 1 }, name: 'by_slug_history' },
    { key: { name: 1 }, name: 'by_name' },
    { key: { isActive: 1, isPremium: -1 }, name: 'by_premium' },
  ],
  [COLLECTIONS.products]: [
    { key: { slug: 1 }, unique: true, name: 'uniq_slug' },
    { key: { slugHistory: 1 }, name: 'by_slug_history' },
    // Every listing surface filters on status first, so it leads each index.
    {
      key: { status: 1, categoryPath: 1, 'priceRange.minSellingPrice': 1 },
      name: 'shop_by_category_price',
    },
    {
      key: { status: 1, categoryPath: 1, 'stats.unitsSold30d': -1 },
      name: 'shop_by_category_popular',
    },
    { key: { status: 1, categoryPath: 1, publishedAt: -1 }, name: 'shop_by_category_new' },
    { key: { status: 1, brandId: 1 }, name: 'shop_by_brand' },
    { key: { status: 1, sellerId: 1 }, name: 'shop_by_seller' },
    { key: { status: 1, gender: 1, 'rating.average': -1 }, name: 'shop_by_gender_rating' },
    { key: { sellerId: 1, status: 1, updatedAt: -1 }, name: 'seller_console' },
    // Platform SKUs and barcodes must be globally unique: ops scans them.
    { key: { 'variants.sku': 1 }, unique: true, sparse: true, name: 'uniq_variant_sku' },
    { key: { 'variants.barcode': 1 }, sparse: true, name: 'by_variant_barcode' },
    { key: { 'variants.id': 1 }, name: 'by_variant_id' },
    {
      key: { title: 'text', description: 'text', tags: 'text', styleCode: 'text' },
      name: 'search_text',
      // A title match should outrank a stray word buried in a description.
      weights: { title: 10, tags: 5, styleCode: 4, description: 1 },
      default_language: 'english',
    },
  ],

  /* ------------------------------------------------------------ commerce */
  [COLLECTIONS.carts]: [
    {
      key: { userId: 1 },
      unique: true,
      partialFilterExpression: { userId: { $type: 'string' } },
      name: 'uniq_user_cart',
    },
    {
      key: { guestToken: 1 },
      unique: true,
      partialFilterExpression: { guestToken: { $type: 'string' } },
      name: 'uniq_guest_cart',
    },
    { key: { updatedAt: -1 }, name: 'by_updated' },
    { key: { expiresAt: 1 }, expireAfterSeconds: 0, name: 'ttl_guest_cart' },
  ],
  [COLLECTIONS.wishlists]: [
    {
      key: { userId: 1 },
      unique: true,
      partialFilterExpression: { userId: { $type: 'string' } },
      name: 'uniq_user_wishlist',
    },
    {
      key: { guestToken: 1 },
      unique: true,
      partialFilterExpression: { guestToken: { $type: 'string' } },
      name: 'uniq_guest_wishlist',
    },
  ],
  [COLLECTIONS.coupons]: [
    { key: { code: 1 }, unique: true, name: 'uniq_code' },
    { key: { isActive: 1, validFrom: 1, validTo: 1 }, name: 'by_validity' },
    { key: { scope: 1 }, name: 'by_scope' },
  ],
  [COLLECTIONS.couponRedemptions]: [
    // The per-order usage cap is enforced by this constraint, not by a count.
    { key: { couponId: 1, orderId: 1 }, unique: true, name: 'uniq_redemption' },
    { key: { couponId: 1, userId: 1 }, name: 'by_coupon_user' },
  ],
  [COLLECTIONS.promotions]: [
    { key: { isActive: 1, startsAt: 1, endsAt: 1 }, name: 'by_window' },
    { key: { type: 1 }, name: 'by_type' },
  ],

  /* -------------------------------------------------------------- orders */
  [COLLECTIONS.orders]: [
    { key: { orderNumber: 1 }, unique: true, name: 'uniq_order_number' },
    { key: { userId: 1, placedAt: -1 }, name: 'by_customer' },
    { key: { placedAt: -1 }, name: 'by_placed' },
    { key: { 'payment.status': 1, placedAt: -1 }, name: 'by_payment_status' },
    {
      key: { idempotencyKey: 1 },
      unique: true,
      partialFilterExpression: { idempotencyKey: { $type: 'string' } },
      name: 'uniq_idempotency',
    },
  ],
  [COLLECTIONS.sellerOrders]: [
    { key: { sellerOrderNumber: 1 }, unique: true, name: 'uniq_seller_order_number' },
    { key: { sellerId: 1, placedAt: -1 }, name: 'by_seller' },
    { key: { orderId: 1 }, name: 'by_order' },
    { key: { sellerId: 1, status: 1, placedAt: -1 }, name: 'seller_queue' },
  ],
  [COLLECTIONS.orderItems]: [
    { key: { orderId: 1 }, name: 'by_order' },
    { key: { sellerOrderId: 1 }, name: 'by_seller_order' },
    { key: { sellerId: 1, status: 1 }, name: 'by_seller_status' },
    { key: { variantId: 1 }, name: 'by_variant' },
    { key: { userId: 1, productId: 1 }, name: 'by_customer_product' },
  ],
  [COLLECTIONS.payments]: [
    { key: { orderId: 1 }, name: 'by_order' },
    {
      key: { providerPaymentId: 1 },
      unique: true,
      // Null until the gateway responds, so partial rather than sparse.
      partialFilterExpression: { providerPaymentId: { $type: 'string' } },
      name: 'uniq_provider_id',
    },
    { key: { status: 1, createdAt: -1 }, name: 'by_status' },
  ],
  [COLLECTIONS.refunds]: [
    { key: { orderId: 1 }, name: 'by_order' },
    { key: { paymentId: 1 }, name: 'by_payment' },
    { key: { status: 1, createdAt: -1 }, name: 'by_status' },
  ],
  [COLLECTIONS.invoices]: [
    { key: { invoiceNumber: 1 }, unique: true, name: 'uniq_invoice_number' },
    { key: { orderId: 1 }, name: 'by_order' },
    { key: { sellerId: 1, issuedAt: -1 }, name: 'by_seller' },
  ],

  /* ---------------------------------------------------------- fulfilment */
  [COLLECTIONS.shipments]: [
    {
      key: { awb: 1 },
      unique: true,
      // Null between shipment creation and label generation.
      partialFilterExpression: { awb: { $type: 'string' } },
      name: 'uniq_awb',
    },
    { key: { sellerOrderId: 1 }, name: 'by_seller_order' },
    { key: { orderId: 1 }, name: 'by_order' },
    { key: { sellerId: 1, status: 1 }, name: 'by_seller_status' },
  ],
  [COLLECTIONS.manifests]: [{ key: { sellerId: 1, createdAt: -1 }, name: 'by_seller' }],
  [COLLECTIONS.returns]: [
    { key: { returnNumber: 1 }, unique: true, name: 'uniq_return_number' },
    { key: { orderId: 1 }, name: 'by_order' },
    { key: { userId: 1, createdAt: -1 }, name: 'by_customer' },
    { key: { sellerId: 1, status: 1 }, name: 'by_seller_status' },
  ],
  [COLLECTIONS.exchanges]: [
    { key: { exchangeNumber: 1 }, unique: true, name: 'uniq_exchange_number' },
    { key: { orderId: 1 }, name: 'by_order' },
    { key: { userId: 1, createdAt: -1 }, name: 'by_customer' },
  ],

  /* ---------------------------------------------------------- engagement */
  [COLLECTIONS.reviews]: [
    // One review per customer per product, enforced structurally.
    { key: { productId: 1, userId: 1 }, unique: true, name: 'uniq_product_review' },
    { key: { productId: 1, status: 1, createdAt: -1 }, name: 'pdp_reviews' },
    { key: { productId: 1, status: 1, helpfulCount: -1 }, name: 'pdp_reviews_helpful' },
    { key: { userId: 1, createdAt: -1 }, name: 'by_customer' },
    { key: { status: 1, createdAt: -1 }, name: 'moderation_queue' },
  ],
  [COLLECTIONS.sellerReviews]: [{ key: { sellerId: 1, createdAt: -1 }, name: 'by_seller' }],
  [COLLECTIONS.questions]: [{ key: { productId: 1, createdAt: -1 }, name: 'by_product' }],
  [COLLECTIONS.notifications]: [
    { key: { userId: 1, createdAt: -1 }, name: 'by_user' },
    { key: { userId: 1, readAt: 1 }, name: 'unread_badge' },
  ],
  [COLLECTIONS.supportTickets]: [
    { key: { ticketNumber: 1 }, unique: true, name: 'uniq_ticket_number' },
    { key: { userId: 1, createdAt: -1 }, name: 'by_user' },
    { key: { status: 1, priority: 1, createdAt: 1 }, name: 'agent_queue' },
  ],
  [COLLECTIONS.helpArticles]: [
    { key: { slug: 1 }, unique: true, name: 'uniq_slug' },
    { key: { category: 1, position: 1 }, name: 'by_category' },
  ],

  /* ------------------------------------------------------------- finance */
  [COLLECTIONS.settlements]: [
    { key: { settlementNumber: 1 }, unique: true, name: 'uniq_settlement_number' },
    { key: { sellerId: 1, periodEnd: -1 }, name: 'by_seller' },
    { key: { status: 1 }, name: 'by_status' },
  ],

  /* ------------------------------------------------------------- content */
  [COLLECTIONS.homeSections]: [{ key: { isActive: 1, position: 1 }, name: 'by_position' }],
  [COLLECTIONS.banners]: [
    { key: { placement: 1, isActive: 1, position: 1 }, name: 'by_placement' },
  ],
  [COLLECTIONS.cmsPages]: [{ key: { slug: 1 }, unique: true, name: 'uniq_slug' }],
  [COLLECTIONS.campaigns]: [{ key: { isActive: 1, startsAt: 1 }, name: 'by_window' }],
  [COLLECTIONS.navigation]: [{ key: { parentId: 1, position: 1 }, name: 'by_parent' }],

  /* ---------------------------------------------------------- governance */
  [COLLECTIONS.auditLogs]: [
    { key: { entityType: 1, entityId: 1, at: -1 }, name: 'by_entity' },
    { key: { actorId: 1, at: -1 }, name: 'by_actor' },
    { key: { at: -1 }, name: 'by_time' },
  ],

  /* ------------------------------------------------------ infrastructure */
  [COLLECTIONS.sagas]: [
    { key: { status: 1, createdAt: 1 }, name: 'recovery_scan' },
    { key: { correlationId: 1 }, name: 'by_correlation' },
  ],
  [COLLECTIONS.webhookEvents]: [
    // The duplicate-webhook defence: a provider replaying an event hits this.
    { key: { provider: 1, eventId: 1 }, unique: true, name: 'uniq_provider_event' },
    { key: { receivedAt: -1 }, name: 'by_received' },
  ],
  [COLLECTIONS.activity]: [{ key: { ownerKey: 1 }, unique: true, name: 'uniq_owner' }],
};

export interface IndexFailure {
  collection: string;
  message: string;
}

async function reconcileUsersIndexes(db: Awaited<ReturnType<typeof getDb>>): Promise<void> {
  const users = db.collection(COLLECTIONS.users);
  const indexes = await users.listIndexes().toArray();

  for (const index of indexes) {
    if (index.name === '_id_' || index.key?.phone !== 1 || index.unique !== true) continue;

    const phoneType = (index.partialFilterExpression as { phone?: { $type?: string } } | undefined)?.phone?.$type;
    if (index.name !== 'uniq_phone' || phoneType !== 'string') {
      await users.dropIndex(index.name);
    }
  }
}

let ensured: Promise<IndexFailure[]> | null = null;

/**
 * Create every index if missing. Idempotent, and memoised per process so the
 * cost is paid once at boot rather than on each request.
 *
 * Failures are collected and RETURNED rather than thrown. At request time an
 * app that cannot build an index is degraded, not broken, so failing the
 * request would be the worse outcome. But a caller that can act on the
 * information -- the seeder, a health check -- gets the list instead of having
 * to scrape logs, because a silently missing unique index is a correctness
 * hole, not a performance one.
 */
export async function ensureIndexes(): Promise<IndexFailure[]> {
  if (ensured) return ensured;

  ensured = (async () => {
    const db = await getDb();
    const failures: IndexFailure[] = [];

    await Promise.all(
      Object.entries(INDEXES).map(async ([name, specs]) => {
        if (!specs?.length) return;
        try {
          if (name === COLLECTIONS.users) await reconcileUsersIndexes(db);
          await db.collection(name).createIndexes(specs);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          failures.push({ collection: name, message });
          console.error(`[vestrawab:db] could not create indexes on "${name}": ${message}`);
        }
      }),
    );

    return failures;
  })();

  return ensured;
}

/** Used by the seeder, which drops and rebuilds rather than reconciling. */
export function indexesFor(name: CollectionName): IndexDescription[] {
  return INDEXES[name] ?? [];
}
