/**
 * Domain vocabulary and state machines.
 *
 * Statuses live at the smallest unit that can legitimately diverge:
 *   - `FulfillmentStatus` on the ORDER ITEM, because one line can be cancelled,
 *     returned or exchanged while its siblings ship normally.
 *   - `ShipmentStatus` on the SHIPMENT, because a seller can split a parcel.
 *   - Order- and seller-order-level status is DERIVED, never stored twice.
 *
 * Every transition is declared here. Nothing in the UI may invent one.
 */

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'accent' | 'premium';

export interface StatusMeta {
  label: string;
  tone: Tone;
  /** Short explanation shown in tooltips and on the customer timeline. */
  description: string;
}

/* ------------------------------------------------------------------ orders */

export const FULFILLMENT_STATUSES = [
  'PLACED',
  'CONFIRMED',
  'PROCESSING',
  'PACKED',
  'READY_FOR_PICKUP',
  'SHIPPED',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'CANCELLED',
  'FAILED',
  'RETURN_REQUESTED',
  'RETURN_APPROVED',
  'RETURN_REJECTED',
  'RETURN_PICKUP',
  'RETURNED',
  'REFUND_INITIATED',
  'REFUNDED',
  'EXCHANGE_REQUESTED',
  'EXCHANGE_APPROVED',
  'EXCHANGE_REJECTED',
  'EXCHANGE_SHIPPED',
  'EXCHANGE_DELIVERED',
] as const;

export type FulfillmentStatus = (typeof FULFILLMENT_STATUSES)[number];

export const FULFILLMENT_STATUS_META: Record<FulfillmentStatus, StatusMeta> = {
  PLACED: { label: 'Order placed', tone: 'info', description: 'We have received your order.' },
  CONFIRMED: { label: 'Confirmed', tone: 'info', description: 'The seller has accepted your order.' },
  PROCESSING: { label: 'Processing', tone: 'info', description: 'The seller is preparing your item.' },
  PACKED: { label: 'Packed', tone: 'info', description: 'Your item is packed and awaiting pickup.' },
  READY_FOR_PICKUP: {
    label: 'Ready for pickup',
    tone: 'info',
    description: 'The courier pickup has been scheduled.',
  },
  SHIPPED: { label: 'Shipped', tone: 'accent', description: 'The courier has collected your parcel.' },
  IN_TRANSIT: { label: 'In transit', tone: 'accent', description: 'Your parcel is on its way.' },
  OUT_FOR_DELIVERY: {
    label: 'Out for delivery',
    tone: 'accent',
    description: 'Your parcel is with the delivery agent today.',
  },
  DELIVERED: { label: 'Delivered', tone: 'success', description: 'Your item has been delivered.' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral', description: 'This item was cancelled.' },
  FAILED: {
    label: 'Failed',
    tone: 'danger',
    description: 'The order could not be completed. Any amount debited is refunded automatically.',
  },
  RETURN_REQUESTED: {
    label: 'Return requested',
    tone: 'warning',
    description: 'We have received your return request.',
  },
  RETURN_APPROVED: {
    label: 'Return approved',
    tone: 'warning',
    description: 'Your return was approved. Pickup will be scheduled.',
  },
  RETURN_REJECTED: {
    label: 'Return rejected',
    tone: 'danger',
    description: 'The return did not pass our checks.',
  },
  RETURN_PICKUP: {
    label: 'Pickup scheduled',
    tone: 'warning',
    description: 'A courier will collect the item from your address.',
  },
  RETURNED: {
    label: 'Returned',
    tone: 'neutral',
    description: 'The item reached the seller and passed quality check.',
  },
  REFUND_INITIATED: {
    label: 'Refund initiated',
    tone: 'warning',
    description: 'Your refund is on its way to the original payment method.',
  },
  REFUNDED: { label: 'Refunded', tone: 'success', description: 'Your refund is complete.' },
  EXCHANGE_REQUESTED: {
    label: 'Exchange requested',
    tone: 'warning',
    description: 'We have received your exchange request.',
  },
  EXCHANGE_APPROVED: {
    label: 'Exchange approved',
    tone: 'warning',
    description: 'Your replacement is reserved and pickup will be scheduled.',
  },
  EXCHANGE_REJECTED: {
    label: 'Exchange rejected',
    tone: 'danger',
    description: 'The exchange could not be completed.',
  },
  EXCHANGE_SHIPPED: {
    label: 'Replacement shipped',
    tone: 'accent',
    description: 'Your replacement is on its way.',
  },
  EXCHANGE_DELIVERED: {
    label: 'Exchange complete',
    tone: 'success',
    description: 'Your replacement has been delivered.',
  },
};

/** The happy path, in order. Used to draw progress bars and timelines. */
export const FORWARD_FLOW: FulfillmentStatus[] = [
  'PLACED',
  'CONFIRMED',
  'PROCESSING',
  'PACKED',
  'READY_FOR_PICKUP',
  'SHIPPED',
  'IN_TRANSIT',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
];

/**
 * Legal transitions. `canTransition` is the ONLY authority -- seller bulk
 * actions, admin overrides and customer cancellations all route through it.
 */
export const FULFILLMENT_TRANSITIONS: Record<FulfillmentStatus, FulfillmentStatus[]> = {
  PLACED: ['CONFIRMED', 'CANCELLED', 'FAILED'],
  CONFIRMED: ['PROCESSING', 'CANCELLED'],
  PROCESSING: ['PACKED', 'CANCELLED'],
  PACKED: ['READY_FOR_PICKUP', 'CANCELLED'],
  READY_FOR_PICKUP: ['SHIPPED', 'CANCELLED'],
  SHIPPED: ['IN_TRANSIT', 'CANCELLED'],
  IN_TRANSIT: ['OUT_FOR_DELIVERY', 'RETURNED'],
  OUT_FOR_DELIVERY: ['DELIVERED', 'IN_TRANSIT', 'RETURNED'],
  DELIVERED: ['RETURN_REQUESTED', 'EXCHANGE_REQUESTED'],
  CANCELLED: ['REFUND_INITIATED'],
  FAILED: ['REFUND_INITIATED'],
  RETURN_REQUESTED: ['RETURN_APPROVED', 'RETURN_REJECTED'],
  RETURN_APPROVED: ['RETURN_PICKUP', 'RETURN_REJECTED'],
  RETURN_REJECTED: ['DELIVERED'],
  RETURN_PICKUP: ['RETURNED', 'RETURN_REJECTED'],
  RETURNED: ['REFUND_INITIATED'],
  REFUND_INITIATED: ['REFUNDED'],
  REFUNDED: [],
  EXCHANGE_REQUESTED: ['EXCHANGE_APPROVED', 'EXCHANGE_REJECTED'],
  EXCHANGE_APPROVED: ['EXCHANGE_SHIPPED', 'EXCHANGE_REJECTED'],
  EXCHANGE_REJECTED: ['DELIVERED'],
  EXCHANGE_SHIPPED: ['EXCHANGE_DELIVERED'],
  EXCHANGE_DELIVERED: ['RETURN_REQUESTED'],
};

export function canTransition(from: FulfillmentStatus, to: FulfillmentStatus): boolean {
  return FULFILLMENT_TRANSITIONS[from]?.includes(to) ?? false;
}

/** Statuses after which nothing more will happen to the line. */
export const TERMINAL_STATUSES: FulfillmentStatus[] = [
  'CANCELLED',
  'REFUNDED',
  'EXCHANGE_DELIVERED',
];

export function isTerminal(status: FulfillmentStatus): boolean {
  return TERMINAL_STATUSES.includes(status);
}

/** A customer may cancel only before the parcel leaves the seller. */
export const CUSTOMER_CANCELLABLE: FulfillmentStatus[] = [
  'PLACED',
  'CONFIRMED',
  'PROCESSING',
  'PACKED',
  'READY_FOR_PICKUP',
];

export function isCustomerCancellable(status: FulfillmentStatus): boolean {
  return CUSTOMER_CANCELLABLE.includes(status);
}

/** Anything the seller still owes work on -- drives the seller "action needed" queue. */
export const SELLER_ACTIONABLE: FulfillmentStatus[] = [
  'PLACED',
  'CONFIRMED',
  'PROCESSING',
  'PACKED',
  'RETURN_REQUESTED',
  'EXCHANGE_REQUESTED',
];

/* --------------------------------------------------------------- shipments */

export const SHIPMENT_STATUSES = [
  'CREATED',
  'LABEL_GENERATED',
  'PICKUP_SCHEDULED',
  'PICKED_UP',
  'IN_TRANSIT',
  'REACHED_HUB',
  'OUT_FOR_DELIVERY',
  'DELIVERED',
  'DELIVERY_FAILED',
  'RTO_INITIATED',
  'RTO_DELIVERED',
  'CANCELLED',
  'LOST',
] as const;

export type ShipmentStatus = (typeof SHIPMENT_STATUSES)[number];

export const SHIPMENT_STATUS_META: Record<ShipmentStatus, StatusMeta> = {
  CREATED: { label: 'Created', tone: 'neutral', description: 'Shipment registered with the courier.' },
  LABEL_GENERATED: {
    label: 'Label generated',
    tone: 'info',
    description: 'Shipping label and AWB issued.',
  },
  PICKUP_SCHEDULED: {
    label: 'Pickup scheduled',
    tone: 'info',
    description: 'Courier pickup has been booked.',
  },
  PICKED_UP: { label: 'Picked up', tone: 'accent', description: 'Courier collected the parcel.' },
  IN_TRANSIT: { label: 'In transit', tone: 'accent', description: 'Parcel is moving between hubs.' },
  REACHED_HUB: {
    label: 'Reached hub',
    tone: 'accent',
    description: 'Parcel arrived at the destination hub.',
  },
  OUT_FOR_DELIVERY: {
    label: 'Out for delivery',
    tone: 'accent',
    description: 'Parcel is with the delivery agent.',
  },
  DELIVERED: { label: 'Delivered', tone: 'success', description: 'Parcel delivered to the customer.' },
  DELIVERY_FAILED: {
    label: 'Delivery failed',
    tone: 'danger',
    description: 'Delivery attempt was unsuccessful.',
  },
  RTO_INITIATED: {
    label: 'RTO initiated',
    tone: 'warning',
    description: 'Parcel is being returned to origin.',
  },
  RTO_DELIVERED: {
    label: 'RTO delivered',
    tone: 'neutral',
    description: 'Parcel returned to the seller.',
  },
  CANCELLED: { label: 'Cancelled', tone: 'neutral', description: 'Shipment was cancelled.' },
  LOST: { label: 'Lost in transit', tone: 'danger', description: 'The courier reported the parcel lost.' },
};

/** Courier state -> customer-facing line state. Keeps the two models in sync. */
export const SHIPMENT_TO_FULFILLMENT: Partial<Record<ShipmentStatus, FulfillmentStatus>> = {
  LABEL_GENERATED: 'PACKED',
  PICKUP_SCHEDULED: 'READY_FOR_PICKUP',
  PICKED_UP: 'SHIPPED',
  IN_TRANSIT: 'IN_TRANSIT',
  REACHED_HUB: 'IN_TRANSIT',
  OUT_FOR_DELIVERY: 'OUT_FOR_DELIVERY',
  DELIVERED: 'DELIVERED',
};

/* ---------------------------------------------------------------- payments */

export const PAYMENT_STATUSES = [
  'PENDING',
  'INITIATED',
  'PROCESSING',
  'AUTHORIZED',
  'CAPTURED',
  'FAILED',
  'CANCELLED',
  'TIMED_OUT',
  'PARTIALLY_REFUNDED',
  'REFUNDED',
] as const;

export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

export const PAYMENT_STATUS_META: Record<PaymentStatus, StatusMeta> = {
  PENDING: { label: 'Pending', tone: 'neutral', description: 'Awaiting payment.' },
  INITIATED: { label: 'Initiated', tone: 'info', description: 'Payment has been started.' },
  PROCESSING: { label: 'Processing', tone: 'info', description: 'Awaiting confirmation from the bank.' },
  AUTHORIZED: { label: 'Authorized', tone: 'info', description: 'Funds are held but not captured.' },
  CAPTURED: { label: 'Paid', tone: 'success', description: 'Payment received.' },
  FAILED: { label: 'Failed', tone: 'danger', description: 'The payment did not succeed.' },
  CANCELLED: { label: 'Cancelled', tone: 'neutral', description: 'The payment was cancelled.' },
  TIMED_OUT: {
    label: 'Awaiting confirmation',
    tone: 'warning',
    description: 'The gateway has not confirmed yet. Do not pay again.',
  },
  PARTIALLY_REFUNDED: {
    label: 'Partially refunded',
    tone: 'warning',
    description: 'Part of this payment has been refunded.',
  },
  REFUNDED: { label: 'Refunded', tone: 'neutral', description: 'This payment has been fully refunded.' },
};

export const PAYMENT_METHODS = ['CARD', 'UPI', 'NETBANKING', 'WALLET', 'COD', 'VESTRA_CREDIT'] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  CARD: 'Credit / Debit card',
  UPI: 'UPI',
  NETBANKING: 'Net banking',
  WALLET: 'Wallet',
  COD: 'Cash on delivery',
  VESTRA_CREDIT: 'VestraWAB Credit',
};

export const REFUND_STATUSES = [
  'PENDING',
  'PROCESSING',
  'COMPLETED',
  'FAILED',
  'ON_HOLD',
] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

export const REFUND_STATUS_META: Record<RefundStatus, StatusMeta> = {
  PENDING: { label: 'Pending', tone: 'warning', description: 'Refund queued for processing.' },
  PROCESSING: { label: 'Processing', tone: 'info', description: 'Sent to the payment provider.' },
  COMPLETED: { label: 'Completed', tone: 'success', description: 'Money has reached the customer.' },
  FAILED: { label: 'Failed', tone: 'danger', description: 'The provider rejected the refund.' },
  ON_HOLD: { label: 'On hold', tone: 'warning', description: 'Held pending an internal review.' },
};

export const REFUND_MODES = ['ORIGINAL', 'VESTRA_CREDIT', 'BANK_TRANSFER'] as const;
export type RefundMode = (typeof REFUND_MODES)[number];

/* ---------------------------------------------------------------- catalogue */

export const PRODUCT_STATUSES = [
  'DRAFT',
  'SUBMITTED',
  'PENDING_REVIEW',
  'APPROVED',
  'REJECTED',
  'PUBLISHED',
  'UNPUBLISHED',
  'ARCHIVED',
] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

export const PRODUCT_STATUS_META: Record<ProductStatus, StatusMeta> = {
  DRAFT: { label: 'Draft', tone: 'neutral', description: 'Not submitted for review yet.' },
  SUBMITTED: { label: 'Submitted', tone: 'info', description: 'Waiting to enter the review queue.' },
  PENDING_REVIEW: { label: 'In review', tone: 'warning', description: 'A catalogue manager is reviewing it.' },
  APPROVED: { label: 'Approved', tone: 'success', description: 'Approved and ready to publish.' },
  REJECTED: { label: 'Rejected', tone: 'danger', description: 'Rejected -- see reviewer notes.' },
  PUBLISHED: { label: 'Live', tone: 'success', description: 'Visible to shoppers.' },
  UNPUBLISHED: { label: 'Unpublished', tone: 'neutral', description: 'Hidden from the storefront.' },
  ARCHIVED: { label: 'Archived', tone: 'neutral', description: 'Retired from the catalogue.' },
};

/** Only these appear on the storefront. Enforced in the catalogue query layer. */
export const SHOPPABLE_PRODUCT_STATUSES: ProductStatus[] = ['PUBLISHED'];

export const STOCK_LEVELS = ['IN_STOCK', 'LOW_STOCK', 'OUT_OF_STOCK', 'DISCONTINUED'] as const;
export type StockLevel = (typeof STOCK_LEVELS)[number];

/* ------------------------------------------------------------------ people */

export const USER_ROLES = [
  'CUSTOMER',
  'SELLER',
  'SELLER_STAFF',
  'SUPPORT',
  'OPERATIONS',
  'FINANCE',
  'CATALOG_MANAGER',
  'MARKETING_MANAGER',
  'ADMIN',
  'SUPER_ADMIN',
] as const;
export type UserRole = (typeof USER_ROLES)[number];

export const USER_ROLE_LABEL: Record<UserRole, string> = {
  CUSTOMER: 'Customer',
  SELLER: 'Seller',
  SELLER_STAFF: 'Seller staff',
  SUPPORT: 'Support',
  OPERATIONS: 'Operations',
  FINANCE: 'Finance',
  CATALOG_MANAGER: 'Catalogue manager',
  MARKETING_MANAGER: 'Marketing manager',
  ADMIN: 'Admin',
  SUPER_ADMIN: 'Super admin',
};

export const ACCOUNT_STATUSES = ['ACTIVE', 'PENDING', 'SUSPENDED', 'DEACTIVATED'] as const;
export type AccountStatus = (typeof ACCOUNT_STATUSES)[number];

export const SELLER_STATUSES = [
  'ONBOARDING',
  'KYC_SUBMITTED',
  'KYC_PENDING',
  'APPROVED',
  'REJECTED',
  'ACTIVE',
  'ON_HOLD',
  'SUSPENDED',
] as const;
export type SellerStatus = (typeof SELLER_STATUSES)[number];

export const SELLER_STATUS_META: Record<SellerStatus, StatusMeta> = {
  ONBOARDING: { label: 'Onboarding', tone: 'neutral', description: 'Seller is completing their profile.' },
  KYC_SUBMITTED: { label: 'KYC submitted', tone: 'info', description: 'Documents submitted for review.' },
  KYC_PENDING: { label: 'KYC pending', tone: 'warning', description: 'Documents are being verified.' },
  APPROVED: { label: 'Approved', tone: 'success', description: 'Approved, awaiting first listing.' },
  REJECTED: { label: 'Rejected', tone: 'danger', description: 'Application was rejected.' },
  ACTIVE: { label: 'Active', tone: 'success', description: 'Selling on VestraWAB.' },
  ON_HOLD: { label: 'On hold', tone: 'warning', description: 'Temporarily paused by operations.' },
  SUSPENDED: { label: 'Suspended', tone: 'danger', description: 'Suspended for policy violation.' },
};

/* ----------------------------------------------------------- settlement */

export const SETTLEMENT_STATUSES = ['PENDING', 'PROCESSING', 'PAID', 'FAILED', 'ON_HOLD'] as const;
export type SettlementStatus = (typeof SETTLEMENT_STATUSES)[number];

export const SETTLEMENT_STATUS_META: Record<SettlementStatus, StatusMeta> = {
  PENDING: { label: 'Pending', tone: 'neutral', description: 'Inside the settlement holding period.' },
  PROCESSING: { label: 'Processing', tone: 'info', description: 'Payout has been submitted to the bank.' },
  PAID: { label: 'Paid', tone: 'success', description: 'Payout credited to the seller account.' },
  FAILED: { label: 'Failed', tone: 'danger', description: 'The bank rejected the payout.' },
  ON_HOLD: { label: 'On hold', tone: 'warning', description: 'Held by finance pending review.' },
};

/* -------------------------------------------------------------- support */

export const TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING_ON_CUSTOMER', 'RESOLVED', 'CLOSED'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_STATUS_META: Record<TicketStatus, StatusMeta> = {
  OPEN: { label: 'Open', tone: 'warning', description: 'Awaiting first response.' },
  IN_PROGRESS: { label: 'In progress', tone: 'info', description: 'An agent is working on it.' },
  WAITING_ON_CUSTOMER: {
    label: 'Waiting on customer',
    tone: 'neutral',
    description: 'We are waiting for more information.',
  },
  RESOLVED: { label: 'Resolved', tone: 'success', description: 'A resolution has been offered.' },
  CLOSED: { label: 'Closed', tone: 'neutral', description: 'The conversation is closed.' },
};

export const TICKET_PRIORITIES = ['LOW', 'NORMAL', 'HIGH', 'URGENT'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const TICKET_PRIORITY_META: Record<TicketPriority, StatusMeta> = {
  LOW: { label: 'Low', tone: 'neutral', description: 'No time pressure.' },
  NORMAL: { label: 'Normal', tone: 'info', description: 'Standard queue.' },
  HIGH: { label: 'High', tone: 'warning', description: 'Needs attention today.' },
  URGENT: { label: 'Urgent', tone: 'danger', description: 'Breach risk -- handle now.' },
};

/* --------------------------------------------------------------- reviews */

export const REVIEW_STATUSES = ['PENDING', 'PUBLISHED', 'REJECTED', 'FLAGGED'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/* --------------------------------------------------------------- coupons */

export const COUPON_TYPES = ['PERCENTAGE', 'FIXED', 'FREE_SHIPPING', 'BUY_X_GET_Y'] as const;
export type CouponType = (typeof COUPON_TYPES)[number];

export const COUPON_SCOPES = ['PLATFORM', 'CATEGORY', 'BRAND', 'SELLER', 'PRODUCT'] as const;
export type CouponScope = (typeof COUPON_SCOPES)[number];

export const AUDIENCE_TYPES = ['ALL', 'NEW_CUSTOMER', 'EXISTING_CUSTOMER', 'SEGMENT'] as const;
export type AudienceType = (typeof AUDIENCE_TYPES)[number];

export const PROMOTION_TYPES = [
  'FLASH_SALE',
  'BANK_OFFER',
  'BUY_X_GET_Y',
  'FLAT_DISCOUNT',
  'PERCENT_DISCOUNT',
  'SELLER_OFFER',
  'CATEGORY_OFFER',
  'FESTIVAL_CAMPAIGN',
] as const;
export type PromotionType = (typeof PROMOTION_TYPES)[number];

/**
 * Whether a promotion's `value` is a percentage or an amount in paise.
 *
 * Carried separately from `PromotionType` because most of those types name a
 * scope or a campaign, not a way of calculating.
 */
export const PROMOTION_VALUE_KINDS = ['PERCENT', 'AMOUNT'] as const;
export type PromotionValueKind = (typeof PROMOTION_VALUE_KINDS)[number];

/**
 * What a promotion's value means, for rows written before `valueKind` existed.
 *
 * A percentage can never exceed 100, so a larger number is unambiguously an
 * amount. That is a fact about percentages rather than a guess about intent,
 * which is what makes it safe to apply to data nobody can go back and ask
 * about.
 */
export function promotionValueKind(promotion: {
  type: PromotionType;
  valueKind?: PromotionValueKind;
  value: number;
}): PromotionValueKind {
  if (promotion.valueKind) return promotion.valueKind;
  if (promotion.type === 'FLAT_DISCOUNT') return 'AMOUNT';
  return promotion.value > 100 ? 'AMOUNT' : 'PERCENT';
}

/* --------------------------------------------------------- notifications */

export const NOTIFICATION_CHANNELS = ['IN_APP', 'EMAIL', 'SMS', 'PUSH', 'WHATSAPP'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_CATEGORIES = [
  'ORDER',
  'SHIPPING',
  'PAYMENT',
  'RETURN',
  'PROMOTION',
  'ACCOUNT',
  'CATALOG',
  'FINANCE',
  'SYSTEM',
] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

/* --------------------------------------------------------------- returns */

export const RETURN_REASONS = [
  'SIZE_TOO_SMALL',
  'SIZE_TOO_LARGE',
  'QUALITY_NOT_AS_EXPECTED',
  'DIFFERENT_FROM_IMAGE',
  'DAMAGED_ITEM',
  'WRONG_ITEM_DELIVERED',
  'MISSING_ITEM',
  'DELAYED_DELIVERY',
  'CHANGED_MIND',
  'BETTER_PRICE_AVAILABLE',
] as const;
export type ReturnReason = (typeof RETURN_REASONS)[number];

export const RETURN_REASON_LABEL: Record<ReturnReason, string> = {
  SIZE_TOO_SMALL: 'Size too small',
  SIZE_TOO_LARGE: 'Size too large',
  QUALITY_NOT_AS_EXPECTED: 'Quality not as expected',
  DIFFERENT_FROM_IMAGE: 'Looks different from the photos',
  DAMAGED_ITEM: 'Item arrived damaged',
  WRONG_ITEM_DELIVERED: 'Wrong item delivered',
  MISSING_ITEM: 'Item missing from the parcel',
  DELAYED_DELIVERY: 'Delivered too late',
  CHANGED_MIND: 'Changed my mind',
  BETTER_PRICE_AVAILABLE: 'Found a better price elsewhere',
};

/** Reasons that make the SELLER liable -- they change who absorbs shipping cost. */
export const SELLER_FAULT_REASONS: ReturnReason[] = [
  'QUALITY_NOT_AS_EXPECTED',
  'DIFFERENT_FROM_IMAGE',
  'DAMAGED_ITEM',
  'WRONG_ITEM_DELIVERED',
  'MISSING_ITEM',
];

export const CANCELLATION_REASONS = [
  'ORDERED_BY_MISTAKE',
  'FOUND_BETTER_PRICE',
  'DELIVERY_TOO_SLOW',
  'CHANGED_MIND',
  'WRONG_ADDRESS',
  'WRONG_VARIANT_SELECTED',
  'SELLER_OUT_OF_STOCK',
  'PAYMENT_ISSUE',
] as const;
export type CancellationReason = (typeof CANCELLATION_REASONS)[number];

export const CANCELLATION_REASON_LABEL: Record<CancellationReason, string> = {
  ORDERED_BY_MISTAKE: 'Ordered by mistake',
  FOUND_BETTER_PRICE: 'Found a better price elsewhere',
  DELIVERY_TOO_SLOW: 'Delivery is taking too long',
  CHANGED_MIND: 'Changed my mind',
  WRONG_ADDRESS: 'Wrong delivery address',
  WRONG_VARIANT_SELECTED: 'Selected the wrong size or colour',
  SELLER_OUT_OF_STOCK: 'Seller is out of stock',
  PAYMENT_ISSUE: 'Payment issue',
};

export const QC_RESULTS = ['PASSED', 'FAILED', 'PARTIAL'] as const;
export type QcResult = (typeof QC_RESULTS)[number];
