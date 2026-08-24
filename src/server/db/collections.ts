import 'server-only';

import type { Collection, Document } from 'mongodb';

import type {
  Address,
  AuditLog,
  Banner,
  Brand,
  Campaign,
  Cart,
  Category,
  CmsPage,
  CommissionPlan,
  Coupon,
  CouponRedemption,
  ExchangeRequest,
  HelpArticle,
  HomeSection,
  Invoice,
  Manifest,
  NavigationNode,
  Notification,
  Order,
  OrderItem,
  Payment,
  Product,
  ProductQuestion,
  Promotion,
  Refund,
  ReturnRequest,
  Review,
  Role,
  Seller,
  SellerFollow,
  SellerLocation,
  SellerOrder,
  SellerReview,
  Settlement,
  Shipment,
  SupportTicket,
  User,
  Wishlist,
} from '@/domain/types';

import { getDb } from './client';

/**
 * Documents are stored AS the domain entity, with `_id` mirroring the entity's
 * own `id`. There is deliberately no ORM mapping layer:
 *
 *   - ids are application-generated (see `lib/ids`), so there is no reason to
 *     carry Mongo's ObjectId through the domain;
 *   - a read is therefore a plain projection away from a domain object, which
 *     removes an entire class of "the mapper dropped a field" bugs.
 *
 * The cost is one duplicated short string per document, which is the right
 * trade for never hand-writing a serializer again.
 */
export type Doc<T> = T & { _id: string };

/** Strip Mongo's `_id` so what leaves the data layer is exactly the domain type. */
export function toEntity<T>(doc: Doc<T> | null): T | null {
  if (!doc) return null;
  const { _id: _ignored, ...entity } = doc;
  return entity as T;
}

export function toEntities<T>(docs: Doc<T>[]): T[] {
  return docs.map((doc) => {
    const { _id: _ignored, ...entity } = doc;
    return entity as T;
  });
}

/** Add the `_id` mirror on the way in. */
export function toDoc<T extends { id: string }>(entity: T): Doc<T> {
  return { ...entity, _id: entity.id };
}

/**
 * Every collection in the system. Kept as a const map so index definitions,
 * the seeder and the reset tool all iterate the same source of truth and can
 * never drift out of sync with each other.
 */
export const COLLECTIONS = {
  /* identity */
  users: 'users',
  addresses: 'addresses',
  roles: 'roles',
  sessions: 'sessions',

  /* sellers */
  sellers: 'sellers',
  sellerLocations: 'sellerLocations',
  sellerFollows: 'sellerFollows',
  commissionPlans: 'commissionPlans',

  /* catalogue */
  categories: 'categories',
  brands: 'brands',
  products: 'products',

  /* commerce */
  carts: 'carts',
  wishlists: 'wishlists',
  coupons: 'coupons',
  couponRedemptions: 'couponRedemptions',
  promotions: 'promotions',

  /* orders */
  orders: 'orders',
  sellerOrders: 'sellerOrders',
  orderItems: 'orderItems',
  payments: 'payments',
  refunds: 'refunds',
  invoices: 'invoices',

  /* fulfilment */
  shipments: 'shipments',
  manifests: 'manifests',
  returns: 'returns',
  exchanges: 'exchanges',

  /* engagement */
  reviews: 'reviews',
  sellerReviews: 'sellerReviews',
  questions: 'questions',
  notifications: 'notifications',
  supportTickets: 'supportTickets',
  helpArticles: 'helpArticles',

  /* finance */
  settlements: 'settlements',

  /* content */
  homeSections: 'homeSections',
  banners: 'banners',
  cmsPages: 'cmsPages',
  campaigns: 'campaigns',
  navigation: 'navigation',

  /* governance */
  auditLogs: 'auditLogs',

  /* infrastructure */
  counters: 'counters',
  sagas: 'sagas',
  webhookEvents: 'webhookEvents',
  activity: 'activity',
} as const;

export type CollectionName = (typeof COLLECTIONS)[keyof typeof COLLECTIONS];

/** Untyped escape hatch for the seeder and admin tooling. */
export async function raw(name: CollectionName): Promise<Collection<Document>> {
  const db = await getDb();
  return db.collection(name);
}

async function typed<T extends Document>(name: CollectionName): Promise<Collection<Doc<T>>> {
  const db = await getDb();
  return db.collection<Doc<T>>(name);
}

/* ------------------------------------------------------------- accessors */

export const collections = {
  users: () => typed<User>(COLLECTIONS.users),
  addresses: () => typed<Address>(COLLECTIONS.addresses),
  roles: () => typed<Role>(COLLECTIONS.roles),

  sellers: () => typed<Seller>(COLLECTIONS.sellers),
  sellerLocations: () => typed<SellerLocation>(COLLECTIONS.sellerLocations),
  sellerFollows: () => typed<SellerFollow>(COLLECTIONS.sellerFollows),
  commissionPlans: () => typed<CommissionPlan>(COLLECTIONS.commissionPlans),

  categories: () => typed<Category>(COLLECTIONS.categories),
  brands: () => typed<Brand>(COLLECTIONS.brands),
  products: () => typed<Product>(COLLECTIONS.products),

  carts: () => typed<Cart>(COLLECTIONS.carts),
  wishlists: () => typed<Wishlist>(COLLECTIONS.wishlists),
  coupons: () => typed<Coupon>(COLLECTIONS.coupons),
  couponRedemptions: () => typed<CouponRedemption>(COLLECTIONS.couponRedemptions),
  promotions: () => typed<Promotion>(COLLECTIONS.promotions),

  orders: () => typed<Order>(COLLECTIONS.orders),
  sellerOrders: () => typed<SellerOrder>(COLLECTIONS.sellerOrders),
  orderItems: () => typed<OrderItem>(COLLECTIONS.orderItems),
  payments: () => typed<Payment>(COLLECTIONS.payments),
  refunds: () => typed<Refund>(COLLECTIONS.refunds),
  invoices: () => typed<Invoice>(COLLECTIONS.invoices),

  shipments: () => typed<Shipment>(COLLECTIONS.shipments),
  manifests: () => typed<Manifest>(COLLECTIONS.manifests),
  returns: () => typed<ReturnRequest>(COLLECTIONS.returns),
  exchanges: () => typed<ExchangeRequest>(COLLECTIONS.exchanges),

  reviews: () => typed<Review>(COLLECTIONS.reviews),
  sellerReviews: () => typed<SellerReview>(COLLECTIONS.sellerReviews),
  questions: () => typed<ProductQuestion>(COLLECTIONS.questions),
  notifications: () => typed<Notification>(COLLECTIONS.notifications),
  supportTickets: () => typed<SupportTicket>(COLLECTIONS.supportTickets),
  helpArticles: () => typed<HelpArticle>(COLLECTIONS.helpArticles),

  settlements: () => typed<Settlement>(COLLECTIONS.settlements),

  homeSections: () => typed<HomeSection>(COLLECTIONS.homeSections),
  banners: () => typed<Banner>(COLLECTIONS.banners),
  cmsPages: () => typed<CmsPage>(COLLECTIONS.cmsPages),
  campaigns: () => typed<Campaign>(COLLECTIONS.campaigns),
  navigation: () => typed<NavigationNode>(COLLECTIONS.navigation),

  auditLogs: () => typed<AuditLog>(COLLECTIONS.auditLogs),
};
