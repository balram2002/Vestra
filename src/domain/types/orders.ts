import type {
  CancellationReason,
  FulfillmentStatus,
  PaymentMethod,
  PaymentStatus,
  QcResult,
  RefundMode,
  RefundStatus,
  ReturnReason,
  ShipmentStatus,
} from '../enums';
import type { Address } from './identity';
import type { PriceBreakdown, TaxLine } from './commerce';

/* ------------------------------------------------------------------ order */

/**
 * The customer order is the contract with the shopper. It is split into one
 * `SellerOrder` per seller, because each seller packs, ships, invoices and is
 * settled independently -- while the shopper still sees a single order.
 */
export interface Order {
  id: string;
  orderNumber: string;
  userId: string | null;
  /** Guest checkout keeps contact details without an account. */
  guestEmail: string | null;
  guestPhone: string | null;

  sellerOrderIds: string[];
  itemIds: string[];

  /** Frozen copy: editing a saved address must never rewrite history. */
  shippingAddress: OrderAddress;
  billingAddress: OrderAddress;

  pricing: PriceBreakdown;
  couponCode: string | null;
  creditApplied: number;

  paymentId: string | null;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;

  /** Derived from the item statuses; stored for cheap list queries. */
  status: FulfillmentStatus;
  statusLabel: string;

  placedAt: string;
  confirmedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;

  estimatedDeliveryFrom: string | null;
  estimatedDeliveryTo: string | null;

  orderNote: string | null;
  giftWrap: boolean;
  /** Marketing attribution, useful in analytics. */
  channel: 'WEB' | 'MOBILE_WEB' | 'APP';
  timeline: OrderEvent[];
  createdAt: string;
  updatedAt: string;
}

/** Address snapshot embedded in an order. */
export type OrderAddress = Omit<Address, 'userId' | 'isDefault' | 'isBillingDefault' | 'createdAt' | 'updatedAt'>;

export interface SellerOrder {
  id: string;
  sellerOrderNumber: string;
  orderId: string;
  orderNumber: string;
  sellerId: string;
  sellerName: string;
  itemIds: string[];
  status: FulfillmentStatus;
  /** Sum of item line totals for this seller. */
  subtotal: number;
  shippingFee: number;
  discount: number;
  tax: number;
  total: number;
  /** Platform commission on this seller order, computed at order time. */
  commission: number;
  commissionRatePercent: number;
  /** What the seller is owed once delivered and past the return window. */
  sellerPayable: number;
  shipmentIds: string[];
  invoiceId: string | null;
  /** Seller must dispatch before this to stay within SLA. */
  dispatchBy: string;
  packedAt: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  cancelledAt: string | null;
  settlementId: string | null;
  placedAt: string;
  updatedAt: string;
}

/**
 * The immutable record of one purchased unit-group. Every descriptive field is
 * a SNAPSHOT: if the seller renames the product or changes its price tomorrow,
 * this order still reads exactly as it did at purchase.
 */
export interface OrderItem {
  id: string;
  orderId: string;
  sellerOrderId: string;
  sellerId: string;

  productId: string;
  variantId: string;

  /* ---- snapshot ---- */
  productTitle: string;
  productSlug: string;
  brandName: string;
  sellerName: string;
  sku: string;
  sellerSku: string;
  size: string;
  colorLabel: string;
  colorHex: string;
  imageUrl: string;
  categoryId: string;
  categoryName: string;
  hsnCode: string;

  quantity: number;
  unitMrp: number;
  unitSellingPrice: number;
  lineMrp: number;
  lineSubtotal: number;
  discount: number;
  couponDiscount: number;
  shippingFee: number;
  taxRatePercent: number;
  taxAmount: number;
  taxBreakup: TaxLine[];
  /** Exactly what this line contributed to the amount paid. */
  lineTotal: number;

  status: FulfillmentStatus;
  /** Quantity already cancelled / returned out of `quantity`. */
  cancelledQuantity: number;
  returnedQuantity: number;

  returnable: boolean;
  returnWindowDays: number;
  returnEligibleUntil: string | null;
  exchangeable: boolean;

  shipmentId: string | null;
  returnId: string | null;
  exchangeId: string | null;

  cancellationReason: CancellationReason | null;
  cancellationNote: string | null;
  cancelledBy: 'CUSTOMER' | 'SELLER' | 'ADMIN' | 'SYSTEM' | null;

  reviewId: string | null;
  deliveredAt: string | null;
  timeline: OrderEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface OrderEvent {
  id: string;
  status: FulfillmentStatus | ShipmentStatus | PaymentStatus | 'NOTE';
  title: string;
  description: string | null;
  /** Where the parcel was, when the event came from the courier. */
  location: string | null;
  actor: 'CUSTOMER' | 'SELLER' | 'ADMIN' | 'COURIER' | 'SYSTEM';
  actorName: string | null;
  occurredAt: string;
}

/* ---------------------------------------------------------------- payment */

export interface Payment {
  id: string;
  orderId: string;
  orderNumber: string;
  userId: string | null;
  provider: 'razorpay' | 'stripe' | 'mock' | 'cod' | 'credit';
  method: PaymentMethod;
  /** Instrument detail for the receipt: "HDFC •••• 4242", "user@okhdfcbank". */
  instrumentLabel: string | null;
  amount: number;
  currency: string;
  status: PaymentStatus;
  /** Provider order/intent id, created before the customer is redirected. */
  providerOrderId: string | null;
  /** Provider payment id, present only after a successful capture. */
  providerPaymentId: string | null;
  providerSignature: string | null;
  /**
   * Guards against double-charging when a customer retries or a webhook is
   * redelivered. Unique per (order, attempt).
   */
  idempotencyKey: string;
  attempt: number;
  failureCode: string | null;
  failureMessage: string | null;
  refundedAmount: number;
  initiatedAt: string;
  authorizedAt: string | null;
  capturedAt: string | null;
  failedAt: string | null;
  /** Raw webhook envelopes, retained for reconciliation. */
  webhookEvents: PaymentWebhookEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface PaymentWebhookEvent {
  id: string;
  eventType: string;
  providerEventId: string;
  signatureValid: boolean;
  /** Set when we had already processed this provider event id. */
  duplicate: boolean;
  receivedAt: string;
  payloadSummary: string;
}

export interface Refund {
  id: string;
  refundNumber: string;
  orderId: string;
  orderNumber: string;
  sellerOrderId: string | null;
  paymentId: string | null;
  userId: string | null;
  /** Which lines this refund covers, and for how many units each. */
  items: Array<{ orderItemId: string; quantity: number; amount: number }>;
  amount: number;
  /** Portion that is shipping being refunded, tracked separately for finance. */
  shippingRefund: number;
  mode: RefundMode;
  status: RefundStatus;
  reason: string;
  /** Who absorbs the cost: affects seller settlement. */
  liability: 'SELLER' | 'PLATFORM' | 'COURIER';
  providerRefundId: string | null;
  failureReason: string | null;
  /** Customer-facing promise, e.g. "by 29 Aug". */
  expectedBy: string | null;
  initiatedAt: string;
  completedAt: string | null;
  initiatedByUserId: string | null;
  timeline: OrderEvent[];
  createdAt: string;
  updatedAt: string;
}

/* --------------------------------------------------------------- shipment */

export interface Shipment {
  id: string;
  shipmentNumber: string;
  orderId: string;
  orderNumber: string;
  sellerOrderId: string;
  sellerId: string;
  /** Items in this parcel. A seller order may be split across parcels. */
  items: Array<{ orderItemId: string; quantity: number }>;
  status: ShipmentStatus;
  direction: 'FORWARD' | 'RETURN' | 'EXCHANGE_FORWARD';

  provider: 'eshopbox' | 'manual';
  /** Eshopbox shipment identifier. */
  providerShipmentId: string | null;
  awb: string | null;
  carrier: string | null;
  carrierServiceType: string | null;
  trackingUrl: string | null;

  labelUrl: string | null;
  manifestId: string | null;
  invoiceId: string | null;

  pickupLocationId: string;
  pickupScheduledAt: string | null;
  pickedUpAt: string | null;

  deliveryAddress: OrderAddress;
  estimatedDeliveryFrom: string | null;
  estimatedDeliveryTo: string | null;
  deliveredAt: string | null;
  deliveryAttempts: number;
  failureReason: string | null;

  weightGrams: number;
  dimensionsCm: { length: number; width: number; height: number };
  /** Declared value for insurance and COD collection. */
  declaredValue: number;
  codAmount: number;

  events: ShipmentEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface ShipmentEvent {
  id: string;
  shipmentId: string;
  status: ShipmentStatus;
  title: string;
  description: string | null;
  location: string | null;
  /** Raw status string as reported by the courier, kept for support. */
  providerStatusCode: string | null;
  occurredAt: string;
}

export interface Manifest {
  id: string;
  manifestNumber: string;
  sellerId: string;
  pickupLocationId: string;
  shipmentIds: string[];
  carrier: string;
  status: 'OPEN' | 'CLOSED' | 'HANDED_OVER';
  documentUrl: string | null;
  createdAt: string;
  closedAt: string | null;
}

/* ---------------------------------------------------------------- returns */

export interface ReturnRequest {
  id: string;
  returnNumber: string;
  orderId: string;
  orderNumber: string;
  sellerOrderId: string;
  sellerId: string;
  userId: string | null;
  items: ReturnItem[];
  status: FulfillmentStatus;
  reason: ReturnReason;
  reasonNote: string | null;
  /** Photos the customer attached as evidence. */
  attachments: string[];
  /** Where the courier collects from. */
  pickupAddress: OrderAddress;
  pickupSlot: { from: string; to: string } | null;
  shipmentId: string | null;
  qcResult: QcResult | null;
  qcNote: string | null;
  qcImages: string[];
  qcByUserId: string | null;
  refundId: string | null;
  refundMode: RefundMode;
  refundAmount: number;
  /** Who pays the reverse-logistics fee. */
  liability: 'SELLER' | 'CUSTOMER' | 'PLATFORM';
  reverseShippingFee: number;
  /** Set when a settlement run has debited this return from the seller. */
  settlementId: string | null;
  rejectionReason: string | null;
  requestedAt: string;
  approvedAt: string | null;
  pickedUpAt: string | null;
  receivedAt: string | null;
  closedAt: string | null;
  timeline: OrderEvent[];
  createdAt: string;
  updatedAt: string;
}

export interface ReturnItem {
  orderItemId: string;
  variantId: string;
  productTitle: string;
  imageUrl: string;
  size: string;
  colorLabel: string;
  quantity: number;
  refundableAmount: number;
}

export interface ExchangeRequest {
  id: string;
  exchangeNumber: string;
  orderId: string;
  orderNumber: string;
  sellerOrderId: string;
  sellerId: string;
  userId: string | null;
  orderItemId: string;
  /** What is being sent back. */
  fromVariantId: string;
  fromSize: string;
  fromColorLabel: string;
  /** What is being sent out. Must be in stock at approval time. */
  toVariantId: string;
  toSize: string;
  toColorLabel: string;
  quantity: number;
  status: FulfillmentStatus;
  reason: ReturnReason;
  reasonNote: string | null;
  /** Difference in price between the two variants; usually zero. */
  priceDifference: number;
  pickupAddress: OrderAddress;
  returnShipmentId: string | null;
  forwardShipmentId: string | null;
  qcResult: QcResult | null;
  rejectionReason: string | null;
  requestedAt: string;
  approvedAt: string | null;
  completedAt: string | null;
  timeline: OrderEvent[];
  createdAt: string;
  updatedAt: string;
}

/* ---------------------------------------------------------------- invoice */

export interface Invoice {
  id: string;
  invoiceNumber: string;
  type: 'TAX_INVOICE' | 'CREDIT_NOTE';
  orderId: string;
  orderNumber: string;
  sellerOrderId: string;
  sellerId: string;
  sellerName: string;
  sellerGstin: string;
  sellerAddress: string;
  buyerName: string;
  buyerAddress: OrderAddress;
  /** Place of supply decides CGST+SGST vs IGST. */
  placeOfSupply: string;
  isInterState: boolean;
  lines: InvoiceLine[];
  subtotal: number;
  discount: number;
  taxableValue: number;
  taxBreakup: TaxLine[];
  shippingFee: number;
  roundOff: number;
  total: number;
  amountInWords: string;
  issuedAt: string;
  /** Set for credit notes raised against a return. */
  relatedInvoiceId: string | null;
}

export interface InvoiceLine {
  description: string;
  hsnCode: string;
  sku: string;
  quantity: number;
  unitPrice: number;
  discount: number;
  taxableValue: number;
  taxRatePercent: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

/* ------------------------------------------------------- order view models */

/** What the order-history list renders, without loading the whole order graph. */
export interface OrderSummary {
  id: string;
  orderNumber: string;
  placedAt: string;
  status: FulfillmentStatus;
  statusLabel: string;
  itemCount: number;
  total: number;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  previewImages: string[];
  previewTitles: string[];
  sellerNames: string[];
  estimatedDeliveryTo: string | null;
  deliveredAt: string | null;
  /** Pre-computed so list rows do not each re-derive permissions. */
  canCancel: boolean;
  canReturn: boolean;
  canExchange: boolean;
  canReview: boolean;
  canReorder: boolean;
  trackingAvailable: boolean;
}

/** Fully hydrated order for the detail page. */
export interface OrderDetail {
  order: Order;
  sellerOrders: Array<{
    sellerOrder: SellerOrder;
    items: OrderItem[];
    shipments: Shipment[];
    invoice: Invoice | null;
  }>;
  payment: Payment | null;
  refunds: Refund[];
  returns: ReturnRequest[];
  exchanges: ExchangeRequest[];
}
