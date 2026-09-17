import type {
  NotificationCategory,
  NotificationChannel,
  ReviewStatus,
  SettlementStatus,
  TicketPriority,
  TicketStatus,
} from '../enums';

/* ---------------------------------------------------------------- reviews */

export interface Review {
  id: string;
  productId: string;
  variantId: string | null;
  sellerId: string;
  userId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  orderItemId: string | null;
  /** Only true when we can tie the review to a delivered order item. */
  verifiedPurchase: boolean;
  rating: number;
  title: string | null;
  body: string;
  images: string[];
  /** Fashion-specific structured feedback shown as chips on the PDP. */
  fitFeedback: 'TOO_SMALL' | 'TRUE_TO_SIZE' | 'TOO_LARGE' | null;
  sizePurchased: string | null;
  status: ReviewStatus;
  helpfulCount: number;
  notHelpfulCount: number;
  reportCount: number;
  /** Seller or support reply shown beneath the review. */
  response: { body: string; byName: string; respondedAt: string } | null;
  moderationNote: string | null;
  moderatedByUserId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SellerReview {
  id: string;
  sellerId: string;
  userId: string;
  authorName: string;
  orderId: string;
  rating: number;
  body: string;
  /** Sub-scores that roll into the seller scorecard. */
  packagingRating: number | null;
  deliveryRating: number | null;
  accuracyRating: number | null;
  status: ReviewStatus;
  createdAt: string;
}

export interface ProductQuestion {
  id: string;
  productId: string;
  userId: string;
  authorName: string;
  question: string;
  answers: ProductAnswer[];
  status: ReviewStatus;
  createdAt: string;
}

export interface ProductAnswer {
  id: string;
  body: string;
  authorName: string;
  authorKind: 'SELLER' | 'CUSTOMER' | 'VESTRA';
  helpfulCount: number;
  createdAt: string;
}

/* ---------------------------------------------------------- notifications */

export interface Notification {
  id: string;
  userId: string;
  category: NotificationCategory;
  title: string;
  body: string;
  /** Deep link into the app, already resolved to a real route. */
  href: string | null;
  imageUrl: string | null;
  read: boolean;
  readAt: string | null;
  /** Channels this notification was actually dispatched on. */
  channels: NotificationChannel[];
  /** Entity that triggered it, for grouping and de-duplication. */
  entityType: string | null;
  entityId: string | null;
  createdAt: string;
}

export interface NotificationTemplate {
  key: string;
  category: NotificationCategory;
  title: string;
  body: string;
  /** Channels enabled by default; user preferences can narrow this. */
  defaultChannels: NotificationChannel[];
  /** Transactional messages ignore marketing opt-outs. */
  transactional: boolean;
  variables: string[];
}

/* --------------------------------------------------------------- support */

export interface SupportTicket {
  id: string;
  ticketNumber: string;
  userId: string;
  requesterName: string;
  requesterEmail: string;
  subject: string;
  category: SupportCategory;
  status: TicketStatus;
  priority: TicketPriority;
  /** Support tickets are usually about something concrete. */
  orderId: string | null;
  orderNumber: string | null;
  orderItemId: string | null;
  sellerId: string | null;
  assignedToUserId: string | null;
  assignedToName: string | null;
  messages: TicketMessage[];
  /** First-response and resolution clocks for the SLA board. */
  firstRespondedAt: string | null;
  resolvedAt: string | null;
  slaDueAt: string;
  satisfactionRating: number | null;
  createdAt: string;
  updatedAt: string;
}

export const SUPPORT_CATEGORIES = [
  'ORDER_ISSUE',
  'DELIVERY_ISSUE',
  'RETURN_REFUND',
  'PAYMENT_ISSUE',
  'PRODUCT_QUALITY',
  'ACCOUNT',
  'SELLER_ISSUE',
  'FEEDBACK',
  'OTHER',
] as const;
export type SupportCategory = (typeof SUPPORT_CATEGORIES)[number];

export const SUPPORT_CATEGORY_LABEL: Record<SupportCategory, string> = {
  ORDER_ISSUE: 'Order issue',
  DELIVERY_ISSUE: 'Delivery issue',
  RETURN_REFUND: 'Return or refund',
  PAYMENT_ISSUE: 'Payment issue',
  PRODUCT_QUALITY: 'Product quality',
  ACCOUNT: 'Account and profile',
  SELLER_ISSUE: 'Seller issue',
  FEEDBACK: 'Feedback',
  OTHER: 'Something else',
};

export interface TicketMessage {
  id: string;
  ticketId: string;
  authorKind: 'CUSTOMER' | 'AGENT' | 'SELLER' | 'SYSTEM';
  authorName: string;
  body: string;
  attachments: Array<{ name: string; url: string; size: number }>;
  /** Agent-only notes are never returned to the customer view. */
  internal: boolean;
  createdAt: string;
}

export interface HelpArticle {
  id: string;
  slug: string;
  topic: string;
  question: string;
  answer: string;
  relatedSlugs: string[];
  helpfulCount: number;
  updatedAt: string;
}

/* --------------------------------------------------------------- finance */

export interface CommissionPlan {
  id: string;
  name: string;
  description: string;
  /** Fallback rate when no category rule matches. */
  defaultRatePercent: number;
  /** Category-specific overrides, most specific wins. */
  categoryRates: Array<{ categoryId: string; ratePercent: number }>;
  /** Flat per-order fee in paise, on top of the percentage. */
  fixedFeePerOrder: number;
  /** Payment gateway charge passed through to the seller. */
  paymentGatewayFeePercent: number;
  /** Days after delivery before funds become settleable. */
  settlementHoldDays: number;
  isDefault: boolean;
  createdAt: string;
}

export interface Settlement {
  id: string;
  settlementNumber: string;
  sellerId: string;
  sellerName: string;
  periodFrom: string;
  periodTo: string;
  status: SettlementStatus;
  /** Sale value of delivered items in the period. */
  grossSales: number;
  /** Value of items returned or cancelled in the period. */
  returns: number;
  netSales: number;
  commission: number;
  paymentGatewayFee: number;
  shippingCharges: number;
  /** Reverse-logistics costs the seller is liable for. */
  reverseShippingCharges: number;
  tcs: number;
  tds: number;
  otherAdjustments: number;
  adjustmentNote: string | null;
  /** netSales - all deductions. */
  netPayable: number;
  utr: string | null;
  bankReference: string | null;
  failureReason: string | null;
  holdReason: string | null;
  lines: SettlementLine[];
  processedAt: string | null;
  paidAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SettlementLine {
  id: string;
  type: 'SALE' | 'RETURN' | 'COMMISSION' | 'SHIPPING' | 'REVERSE_SHIPPING' | 'TCS' | 'TDS' | 'ADJUSTMENT' | 'GATEWAY_FEE';
  orderNumber: string | null;
  sellerOrderId: string | null;
  orderItemId: string | null;
  description: string;
  /** Positive credits the seller, negative debits them. */
  amount: number;
  occurredAt: string;
}

export interface SellerEarningsSummary {
  lifetimeGross: number;
  lifetimeNet: number;
  /** Delivered but still inside the settlement hold window. */
  pendingSettlement: number;
  /** Cleared the hold, awaiting the next payout run. */
  availableForPayout: number;
  paidOut: number;
  onHold: number;
  thisMonthGross: number;
  thisMonthNet: number;
  nextPayoutDate: string;
  commissionThisMonth: number;
  returnsThisMonth: number;
}

/* ------------------------------------------------------------------- CMS */

export type HomeSectionKind =
  | 'HERO_CAROUSEL'
  | 'CATEGORY_STRIP'
  | 'PRODUCT_RAIL'
  | 'BANNER_GRID'
  | 'BRAND_STRIP'
  | 'DEAL_COUNTDOWN'
  | 'EDITORIAL'
  | 'SELLER_SPOTLIGHT'
  | 'REELS_STRIP'
  | 'TESTIMONIALS'
  | 'VALUE_PROPS'
  | 'NEWSLETTER';

/**
 * Homepage composition is data, not code. The admin CMS reorders, toggles and
 * retargets these; the renderer maps `kind` to a component.
 */
export interface HomeSection {
  id: string;
  kind: HomeSectionKind;
  /**
   * Which page this sits on: 'home', or a CMS page's slug.
   *
   * Absent on sections written before landing pages could be composed, which
   * is why every read treats "missing" as the homepage.
   */
  page?: string;
  /**
   * The shipped section this one is, if it is one: 'home:PRODUCT_RAIL:4'.
   *
   * What lets "reset" put a renamed rail back to what it was. Stamped the first
   * time a section is reset; before that the shipped title identifies it.
   */
  defaultKey?: string;
  title: string | null;
  subtitle: string | null;
  /** Optional "See all" destination. */
  href: string | null;
  ctaLabel: string | null;
  position: number;
  isActive: boolean;
  /** Show only within this window; null means always. */
  startsAt: string | null;
  endsAt: string | null;
  /** Restrict to a device class where the design demands it. */
  visibleOn: 'ALL' | 'DESKTOP' | 'MOBILE';
  config: HomeSectionConfig;
  updatedAt: string;
  updatedByUserId: string | null;
}

export interface HomeSectionConfig {
  /** Independent visual compositions; absent means the shipped layout. */
  layoutDesktop?: 'DEFAULT' | 'FEATURED' | 'MOSAIC';
  layoutMobile?: 'DEFAULT' | 'FEATURED' | 'MOSAIC';
  /** Auto keeps the existing shelf selection; manual may intentionally be empty. */
  categoryMode?: 'AUTO' | 'MANUAL';
  /** For PRODUCT_RAIL: how products are chosen. */
  source?: 'MANUAL' | 'NEW_ARRIVALS' | 'BESTSELLERS' | 'TRENDING' | 'DEALS' | 'RECOMMENDED' | 'CATEGORY' | 'BRAND';
  productIds?: string[];
  categoryId?: string;
  /** Hand-picked categories, in the order they should appear. */
  categoryIds?: string[];
  brandIds?: string[];
  sellerIds?: string[];
  limit?: number;
  bannerIds?: string[];
  promotionId?: string;
  /** For EDITORIAL. */
  body?: string;
  imageUrl?: string;
  layout?: 'GRID_2' | 'GRID_3' | 'GRID_4' | 'CAROUSEL' | 'SPLIT' | 'BANNER';
  theme?: 'light' | 'dark' | 'accent';
}

export interface Banner {
  id: string;
  name: string;
  placement: 'HOME_HERO' | 'HOME_GRID' | 'CATEGORY_TOP' | 'PLP_INLINE' | 'CHECKOUT' | 'APP_STRIP';
  /** A short label over the headline, such as the department. */
  eyebrow?: string | null;
  headline: string | null;
  subheadline: string | null;
  ctaLabel: string | null;
  href: string;
  imageUrl: string;
  mobileImageUrl: string | null;
  alt: string;
  /** Text colour scheme for overlaid copy. */
  theme: 'light' | 'dark';
  position: number;
  isActive: boolean;
  startsAt: string | null;
  endsAt: string | null;
  impressions: number;
  clicks: number;
  createdAt: string;
  updatedAt: string;
}

export interface CmsPage {
  id: string;
  slug: string;
  title: string;
  body: string;
  metaTitle: string | null;
  metaDescription: string | null;
  isPublished: boolean;
  updatedAt: string;
  updatedByUserId: string | null;
}

export interface NavigationNode {
  id: string;
  label: string;
  href: string;
  /** Column grouping inside a mega menu panel. */
  group: string | null;
  children: NavigationNode[];
  imageUrl: string | null;
  badge: string | null;
  highlight: boolean;
  position: number;
  isActive: boolean;
}

export interface Campaign {
  id: string;
  slug: string;
  name: string;
  description: string;
  promotionIds: string[];
  couponIds: string[];
  bannerIds: string[];
  categoryIds: string[];
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  heroImageUrl: string | null;
  theme: string;
  /** Measured outcomes shown on the marketing dashboard. */
  metrics: { impressions: number; clicks: number; orders: number; gmv: number };
  createdAt: string;
}

/* ------------------------------------------------------------ audit log */

export interface AuditLog {
  id: string;
  actorUserId: string;
  actorName: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  entityLabel: string;
  /** Only the fields that changed, with old and new values. */
  changes: Array<{ field: string; before: unknown; after: unknown }>;
  note: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  severity: 'INFO' | 'NOTICE' | 'WARNING' | 'CRITICAL';
  occurredAt: string;
}

/* -------------------------------------------------------------- analytics */

export interface TimeSeriesPoint {
  date: string;
  value: number;
  /** Same period, previous cycle -- powers the comparison line. */
  compareValue?: number;
}

export interface MetricValue {
  key: string;
  label: string;
  value: number;
  /** Percentage change vs the comparison period. */
  changePercent: number | null;
  format: 'money' | 'number' | 'percent' | 'rating' | 'duration';
  /** Whether an increase is good. Drives the arrow colour. */
  positiveIsGood: boolean;
  hint: string | null;
}

export interface BreakdownRow {
  key: string;
  label: string;
  value: number;
  share: number;
  changePercent: number | null;
  href?: string;
  imageUrl?: string | null;
  secondary?: string | null;
}

export interface DateRange {
  from: string;
  to: string;
  /** Preset key used by the range picker, when one is active. */
  preset: DateRangePreset | null;
}

export const DATE_RANGE_PRESETS = [
  'today',
  'yesterday',
  '7d',
  '30d',
  '90d',
  'mtd',
  'qtd',
  'ytd',
  'custom',
] as const;
export type DateRangePreset = (typeof DATE_RANGE_PRESETS)[number];

export const DATE_RANGE_PRESET_LABEL: Record<DateRangePreset, string> = {
  today: 'Today',
  yesterday: 'Yesterday',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  mtd: 'Month to date',
  qtd: 'Quarter to date',
  ytd: 'Year to date',
  custom: 'Custom range',
};

export interface AdminDashboardData {
  range: DateRange;
  metrics: MetricValue[];
  gmvSeries: TimeSeriesPoint[];
  orderSeries: TimeSeriesPoint[];
  customerSeries: TimeSeriesPoint[];
  sellerSeries: TimeSeriesPoint[];
  categoryBreakdown: BreakdownRow[];
  sellerBreakdown: BreakdownRow[];
  paymentMethodBreakdown: BreakdownRow[];
  geoBreakdown: BreakdownRow[];
  topProducts: BreakdownRow[];
  pendingApprovals: { sellers: number; products: number; returns: number; refunds: number; reviews: number };
  alerts: OperationalAlert[];
}

export interface SellerDashboardData {
  range: DateRange;
  metrics: MetricValue[];
  revenueSeries: TimeSeriesPoint[];
  orderSeries: TimeSeriesPoint[];
  unitSeries: TimeSeriesPoint[];
  categoryBreakdown: BreakdownRow[];
  topProducts: BreakdownRow[];
  actionQueue: { newOrders: number; toPack: number; toShip: number; returns: number; lowStock: number; outOfStock: number };
  inventoryAlerts: InventoryAlert[];
  alerts: OperationalAlert[];
}

export interface OperationalAlert {
  id: string;
  severity: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  href: string | null;
  actionLabel: string | null;
  occurredAt: string;
}

export interface InventoryAlert {
  variantId: string;
  productId: string;
  productTitle: string;
  sku: string;
  size: string;
  colorLabel: string;
  imageUrl: string;
  available: number;
  threshold: number;
  unitsSold30d: number;
  /** Estimated days until stock-out at the current sell-through rate. */
  daysOfCover: number | null;
}
