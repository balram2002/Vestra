import 'server-only';

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

/**
 * The database shape.
 *
 * Collections are keyed by id for O(1) reads; every repository that needs a
 * different access path builds its own index on top (see `indexes.ts`). This
 * mirrors how the same data would sit in tables with secondary indexes, so
 * swapping this layer for Postgres or Mongo is a repository-level change and
 * nothing above it moves.
 */
export interface Database {
  meta: {
    version: number;
    seededAt: string;
    /** Fixed seed so the whole dataset regenerates identically. */
    seed: number;
    /** Monotonic counters for invoice and settlement numbering. */
    sequences: Record<string, number>;
  };

  /* identity */
  users: Record<string, User>;
  addresses: Record<string, Address>;
  roles: Record<string, Role>;

  /* sellers */
  sellers: Record<string, Seller>;
  sellerLocations: Record<string, SellerLocation>;
  sellerFollows: Record<string, SellerFollow>;
  commissionPlans: Record<string, CommissionPlan>;

  /* catalogue */
  categories: Record<string, Category>;
  brands: Record<string, Brand>;
  products: Record<string, Product>;

  /* commerce */
  carts: Record<string, Cart>;
  wishlists: Record<string, Wishlist>;
  coupons: Record<string, Coupon>;
  couponRedemptions: Record<string, CouponRedemption>;
  promotions: Record<string, Promotion>;

  /* orders */
  orders: Record<string, Order>;
  sellerOrders: Record<string, SellerOrder>;
  orderItems: Record<string, OrderItem>;
  payments: Record<string, Payment>;
  refunds: Record<string, Refund>;
  invoices: Record<string, Invoice>;

  /* fulfilment */
  shipments: Record<string, Shipment>;
  manifests: Record<string, Manifest>;
  returns: Record<string, ReturnRequest>;
  exchanges: Record<string, ExchangeRequest>;

  /* engagement */
  reviews: Record<string, Review>;
  sellerReviews: Record<string, SellerReview>;
  questions: Record<string, ProductQuestion>;
  notifications: Record<string, Notification>;
  supportTickets: Record<string, SupportTicket>;
  helpArticles: Record<string, HelpArticle>;

  /* finance */
  settlements: Record<string, Settlement>;

  /* content */
  homeSections: Record<string, HomeSection>;
  banners: Record<string, Banner>;
  cmsPages: Record<string, CmsPage>;
  campaigns: Record<string, Campaign>;
  navigation: Record<string, NavigationNode>;

  /* governance */
  auditLogs: Record<string, AuditLog>;

  /** Recently-viewed and search history, keyed by user or guest token. */
  activity: Record<string, { recentlyViewed: string[]; recentSearches: string[] }>;
}

export type CollectionName = {
  [K in keyof Database]: Database[K] extends Record<string, unknown> ? K : never;
}[keyof Database];

export function emptyDatabase(): Database {
  return {
    meta: { version: DB_VERSION, seededAt: new Date(0).toISOString(), seed: 0, sequences: {} },
    users: {},
    addresses: {},
    roles: {},
    sellers: {},
    sellerLocations: {},
    sellerFollows: {},
    commissionPlans: {},
    categories: {},
    brands: {},
    products: {},
    carts: {},
    wishlists: {},
    coupons: {},
    couponRedemptions: {},
    promotions: {},
    orders: {},
    sellerOrders: {},
    orderItems: {},
    payments: {},
    refunds: {},
    invoices: {},
    shipments: {},
    manifests: {},
    returns: {},
    exchanges: {},
    reviews: {},
    sellerReviews: {},
    questions: {},
    notifications: {},
    supportTickets: {},
    helpArticles: {},
    settlements: {},
    homeSections: {},
    banners: {},
    cmsPages: {},
    campaigns: {},
    navigation: {},
    auditLogs: {},
    activity: {},
  };
}

/**
 * Bumping this discards any persisted snapshot and reseeds. Raise it whenever
 * the shape changes incompatibly so a stale `.data` file cannot crash boot.
 */
export const DB_VERSION = 7;
