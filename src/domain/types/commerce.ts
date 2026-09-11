import type { ProductSummary } from './catalog';
import type { AudienceType, CouponScope, CouponType, PaymentMethod, PromotionType, StockLevel,
  PromotionValueKind,
} from '../enums';

/* -------------------------------------------------------------- price math */

/**
 * The result of the pricing engine. This object is computed ON THE SERVER and
 * is the only thing allowed to decide what a customer pays. The client renders
 * it; it never recomputes it.
 *
 * All amounts are integer paise.
 */
export interface PriceBreakdown {
  /** Sum of MRP across all units. */
  mrpTotal: number;
  /** Sum of selling price across all units, before any promotion. */
  subtotal: number;
  /** MRP minus selling price, i.e. the discount already baked into the price. */
  listDiscount: number;
  /** Seller-funded promotion discounts. */
  sellerDiscount: number;
  /** Platform-funded promotion discounts. */
  platformDiscount: number;
  /** Coupon discount, after all caps and eligibility rules. */
  couponDiscount: number;
  /** Value of the applied coupon before capping, kept for the "you saved" copy. */
  couponCode: string | null;
  shippingFee: number;
  shippingDiscount: number;
  codFee: number;
  /** Handling / packaging charge. */
  packagingFee: number;
  giftWrapFee: number;
  /** GST, extracted from the tax-inclusive selling price. */
  taxTotal: number;
  taxBreakup: TaxLine[];
  /** VestraWAB Credit / wallet applied. */
  creditApplied: number;
  /** What the customer actually pays now. */
  payable: number;
  /** mrpTotal - payable, for the "You saved X" line. */
  totalSavings: number;
  savingsPercent: number;
  /** Per-line allocation so refunds and settlements can be derived exactly. */
  lines: PriceLine[];
}

export interface PriceLine {
  /** Cart item id, or order item id once the order exists. */
  refId: string;
  variantId: string;
  sellerId: string;
  quantity: number;
  unitMrp: number;
  unitSellingPrice: number;
  lineMrp: number;
  lineSubtotal: number;
  /** Proportional share of each cart-level amount. */
  sellerDiscount: number;
  platformDiscount: number;
  couponDiscount: number;
  shippingFee: number;
  shippingDiscount: number;
  packagingFee: number;
  taxRatePercent: number;
  taxAmount: number;
  /** The exact amount refundable if this single line is returned. */
  lineTotal: number;
}

export interface TaxLine {
  ratePercent: number;
  taxableValue: number;
  cgst: number;
  sgst: number;
  igst: number;
  total: number;
}

/* ---------------------------------------------------------------- the bag */

export interface Cart {
  id: string;
  /** Null for a guest bag; set once the shopper signs in. */
  userId: string | null;
  /** Anonymous identifier held in an httpOnly cookie. */
  guestToken: string | null;
  items: CartItem[];
  savedForLater: CartItem[];
  couponCode: string | null;
  /** Address chosen during checkout; drives shipping and serviceability. */
  addressId: string | null;
  shippingOptionId: string | null;
  paymentMethod: PaymentMethod | null;
  useCredit: boolean;
  giftWrap: boolean;
  orderNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CartItem {
  id: string;
  productId: string;
  variantId: string;
  sellerId: string;
  quantity: number;
  /**
   * Price seen by the shopper when the item entered the bag. Checkout compares
   * this against the live price and refuses to proceed silently if it moved.
   */
  priceAtAdd: number;
  addedAt: string;
  /**
   * A price a store quoted on a live call, held for ONE piece.
   *
   * Verified against the call when the line is added (this shopper owned it,
   * the offer was current). After that only its expiry is re-checked, so
   * signing in at checkout, which moves the line to another cart, keeps it.
   */
  liveOffer?: LiveOfferHold | null;
}

/** A live-call price held on a bag line. See `CartItem.liveOffer`. */
export interface LiveOfferHold {
  sessionId: string;
  /** Paise, for one piece. */
  price: number;
  expiresAt: string;
  /** For the bag line: "Live price from {sellerName}". */
  sellerName: string;
}

/**
 * A cart item joined with live catalogue data. Everything the bag UI needs,
 * including the problems that must block checkout.
 */
export interface CartLine {
  item: CartItem;
  productId: string;
  productSlug: string;
  productTitle: string;
  brandName: string;
  sellerId: string;
  sellerName: string;
  sellerSlug: string;
  variantId: string;
  sku: string;
  size: string;
  colorLabel: string;
  colorHex: string;
  image: string;
  mrp: number;
  sellingPrice: number;
  discountPercent: number;
  quantity: number;
  maxQuantity: number;
  available: number;
  stockLevel: StockLevel;
  returnable: boolean;
  returnWindowDays: number;
  estimatedDelivery: { from: string; to: string } | null;
  issues: CartLineIssue[];
  /** Set while this line is at a price quoted on a live call. */
  liveOffer: { sellerName: string; expiresAt: string } | null;
}

export type CartIssueKind =
  | 'OUT_OF_STOCK'
  | 'INSUFFICIENT_STOCK'
  | 'PRICE_INCREASED'
  | 'PRICE_DECREASED'
  | 'PRODUCT_UNPUBLISHED'
  | 'VARIANT_INACTIVE'
  | 'SELLER_INACTIVE'
  | 'QUANTITY_LIMIT'
  | 'NOT_SERVICEABLE'
  | 'COD_UNAVAILABLE';

export interface CartLineIssue {
  kind: CartIssueKind;
  /** Whether this alone must stop checkout. */
  blocking: boolean;
  message: string;
  /** What the UI should offer: reduce quantity, remove, accept new price. */
  resolution: 'REMOVE' | 'REDUCE_QUANTITY' | 'ACCEPT_PRICE' | 'MOVE_TO_WISHLIST' | 'CHANGE_PAYMENT' | 'NONE';
  suggestedQuantity?: number;
}

/** The bag grouped the way it will actually be fulfilled: one block per seller. */
export interface CartSellerGroup {
  sellerId: string;
  sellerName: string;
  sellerSlug: string;
  sellerRating: number;
  lines: CartLine[];
  subtotal: number;
  shippingFee: number;
  freeShippingThreshold: number | null;
  amountToFreeShipping: number | null;
  estimatedDelivery: { from: string; to: string } | null;
  sellerOffers: AppliedOffer[];
}

export interface CartView {
  cartId: string;
  groups: CartSellerGroup[];
  savedForLater: CartLine[];
  totalItems: number;
  totalUnits: number;
  pricing: PriceBreakdown;
  coupon: AppliedCoupon | null;
  /** Coupons the shopper could apply right now, best first. */
  availableCoupons: CouponOffer[];
  offers: AppliedOffer[];
  issues: CartLineIssue[];
  /** True when nothing blocking remains and checkout may start. */
  checkoutReady: boolean;
  creditAvailable: number;
}

export interface AppliedCoupon {
  code: string;
  title: string;
  discount: number;
  fundedBy: 'PLATFORM' | 'SELLER';
}

export interface AppliedOffer {
  id: string;
  type: PromotionType;
  title: string;
  description: string;
  discount: number;
  fundedBy: 'PLATFORM' | 'SELLER';
}

/* ---------------------------------------------------------------- wishlist */

export interface Wishlist {
  id: string;
  userId: string | null;
  guestToken: string | null;
  name: string;
  isDefault: boolean;
  items: WishlistItem[];
  createdAt: string;
  updatedAt: string;
}

export interface WishlistItem {
  id: string;
  productId: string;
  /** Optional: the shopper may save a specific size. */
  variantId: string | null;
  /** Price when saved, so we can surface "price dropped by X". */
  priceAtAdd: number;
  notifyOnRestock: boolean;
  addedAt: string;
}

export interface WishlistLine {
  item: WishlistItem;
  product: ProductSummary;
  priceDrop: number;
  isBackInStock: boolean;
  selectedSize: string | null;
}

/* ----------------------------------------------------------------- coupons */

export interface Coupon {
  id: string;
  code: string;
  title: string;
  description: string;
  type: CouponType;
  scope: CouponScope;
  /** Percentage for PERCENTAGE, paise for FIXED. */
  value: number;
  maxDiscount: number | null;
  minCartValue: number;
  /** Restricts which lines the coupon may discount. */
  categoryIds: string[];
  brandIds: string[];
  sellerIds: string[];
  productIds: string[];
  excludedProductIds: string[];
  audience: AudienceType;
  segmentKey: string | null;
  paymentMethods: PaymentMethod[];
  /** null = unlimited. */
  totalUsageLimit: number | null;
  perUserLimit: number;
  usedCount: number;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  /** Whether it may combine with automatic promotions. Coupons never stack. */
  stackableWithOffers: boolean;
  fundedBy: 'PLATFORM' | 'SELLER';
  /** Shown in the coupon list even when not currently applicable. */
  visible: boolean;
  termsAndConditions: string[];
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  buyXGetY: BuyXGetYRule | null;
}

export interface BuyXGetYRule {
  buyQuantity: number;
  getQuantity: number;
  /** Which of the qualifying items is free: the cheapest is the usual rule. */
  applyTo: 'CHEAPEST' | 'MOST_EXPENSIVE';
  discountPercent: number;
}

/** A coupon rendered for the shopper, with the outcome of evaluating it now. */
export interface CouponOffer {
  code: string;
  title: string;
  description: string;
  /** What it would save right now, or 0 when not applicable. */
  potentialDiscount: number;
  applicable: boolean;
  /** Why it cannot be applied, phrased for the shopper. */
  reason: string | null;
  /** How much more is needed to unlock it. */
  amountToUnlock: number | null;
  endsAt: string;
  termsAndConditions: string[];
}

export interface CouponRedemption {
  id: string;
  couponId: string;
  code: string;
  userId: string;
  orderId: string;
  discount: number;
  redeemedAt: string;
  /** Set when an order is cancelled and the redemption is given back. */
  revokedAt: string | null;
}

/* -------------------------------------------------------------- promotions */

export interface Promotion {
  id: string;
  slug: string;
  title: string;
  subtitle: string | null;
  description: string;
  type: PromotionType;
  /**
   * What `value` MEANS.
   *
   * Explicit rather than inferred from `type`, because `type` conflates two
   * unrelated things: FLAT_DISCOUNT and PERCENT_DISCOUNT describe the value,
   * while FLASH_SALE, BANK_OFFER, SELLER_OFFER, CATEGORY_OFFER and
   * FESTIVAL_CAMPAIGN describe the scope or the branding and say nothing about
   * it. A seeded "flat ₹300 off" SELLER_OFFER was read as 30,000% and
   * discounted whole orders to zero, which is what this field exists to make
   * impossible.
   */
  valueKind: PromotionValueKind;
  /** A percentage (0–100) when `valueKind` is PERCENT, otherwise paise. */
  value: number;
  maxDiscount: number | null;
  minOrderValue: number;
  categoryIds: string[];
  brandIds: string[];
  sellerIds: string[];
  productIds: string[];
  /** Bank offers are messaging-only until the matching instrument is chosen. */
  paymentMethods: PaymentMethod[];
  bankName: string | null;
  startsAt: string;
  endsAt: string;
  isActive: boolean;
  priority: number;
  fundedBy: 'PLATFORM' | 'SELLER';
  bannerUrl: string | null;
  badgeText: string | null;
  buyXGetY: BuyXGetYRule | null;
  /** Flash sales cap how many units may be sold at the promo price. */
  stockLimit: number | null;
  stockSold: number;
  createdAt: string;
  updatedAt: string;
}

/* --------------------------------------------------------------- shipping */

export interface ShippingOption {
  id: string;
  label: string;
  description: string;
  /** Paise. Zero when a free-shipping rule applied. */
  fee: number;
  originalFee: number;
  minDays: number;
  maxDays: number;
  estimatedFrom: string;
  estimatedTo: string;
  /** Courier partner resolved through the shipping provider. */
  carrier: string | null;
  codAvailable: boolean;
  recommended: boolean;
}

export interface ServiceabilityResult {
  pincode: string;
  serviceable: boolean;
  city: string | null;
  state: string | null;
  codAvailable: boolean;
  prepaidAvailable: boolean;
  returnPickupAvailable: boolean;
  estimatedFrom: string | null;
  estimatedTo: string | null;
  /** Explains a negative result to the shopper. */
  message: string | null;
}
