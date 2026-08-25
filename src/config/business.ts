/**
 * Business constants.
 *
 * Every threshold, window and fee that the business could plausibly want to
 * change lives here rather than being sprinkled through components. Anything
 * a seller or admin can override at runtime is a DEFAULT here, not a hard rule.
 */

import { toPaise } from '@/lib/money';

/* ------------------------------------------------------------------- cart */

export const CART = {
  /** Per-variant cap, to stop bulk buying at retail prices. */
  maxQuantityPerVariant: 5,
  maxDistinctItems: 50,
  /** A guest bag survives this long before it is swept. */
  guestCartTtlDays: 30,
  /** Bags untouched for this long are counted as abandoned by marketing. */
  abandonedAfterHours: 6,
} as const;

/* --------------------------------------------------------------- shipping */

export const SHIPPING = {
  /** Standard delivery fee when no free-shipping rule applies. */
  standardFee: toPaise(79),
  expressFee: toPaise(149),
  /** Platform-wide free-shipping floor; sellers may set a lower one. */
  freeShippingThreshold: toPaise(1199),
  codFee: toPaise(49),
  giftWrapFee: toPaise(59),
  packagingFee: 0,
  /** Reverse-logistics cost charged to whoever is liable for a return. */
  reversePickupFee: toPaise(99),
  standardDays: { min: 3, max: 6 },
  expressDays: { min: 1, max: 2 },
  /** Metro pincodes get the faster promise. */
  metroDays: { min: 2, max: 4 },
  /** Orders placed after this hour ship the next working day. */
  dispatchCutoffHour: 14,
  maxCodOrderValue: toPaise(15000),
} as const;

/* ---------------------------------------------------------------- returns */

export const RETURNS = {
  defaultWindowDays: 14,
  defaultExchangeWindowDays: 14,
  /** Beauty, innerwear and similar are excluded by category policy. */
  minWindowDays: 7,
  maxWindowDays: 30,
  /** How long the customer has to hand the parcel over after approval. */
  pickupWindowDays: 5,
  qcSlaDays: 2,
  refundSlaDays: { prepaid: 5, cod: 7 },
} as const;

/* ---------------------------------------------------------------- orders */

export const ORDERS = {
  /** Seller must dispatch within this or the order breaches SLA. */
  defaultDispatchSlaHours: 24,
  /** Auto-confirm unacknowledged orders so fulfilment is never stuck. */
  autoConfirmAfterMinutes: 30,
  /** A pending payment older than this is abandoned and stock released. */
  paymentTimeoutMinutes: 15,
  /** Window during which a customer may cancel without contacting support. */
  freeCancellationHours: 24,
  maxDeliveryAttempts: 3,
} as const;

/* -------------------------------------------------------------- inventory */

export const INVENTORY = {
  defaultLowStockThreshold: 5,
  /** Stock is held this long while a checkout is in flight. */
  reservationMinutes: 15,
  /** Below this the storefront shows "Only N left". */
  urgencyThreshold: 5,
} as const;

/* --------------------------------------------------------------- pricing */

export const PRICING = {
  /** Default GST slab when a category does not specify one. */
  defaultTaxRatePercent: 12,
  /** Apparel below this value is taxed at the lower slab in India. */
  apparelLowSlabThreshold: toPaise(1000),
  apparelLowSlabPercent: 5,
  apparelHighSlabPercent: 12,
  /** Home state for the marketplace; decides IGST vs CGST+SGST. */
  originState: 'Karnataka',
  currency: 'INR',
  currencySymbol: '₹',
  locale: 'en-IN',
} as const;

/* ----------------------------------------------------------------- finance */

export const FINANCE = {
  defaultCommissionPercent: 12,
  paymentGatewayFeePercent: 2,
  /** Days after delivery before the seller's money clears the hold. */
  settlementHoldDays: 7,
  /** TCS under section 206C(1H) for marketplace operators. */
  tcsPercent: 1,
  tdsPercent: 1,
  payoutDayOfWeek: 3,
  minPayoutAmount: toPaise(500),
} as const;

/* --------------------------------------------------------------- catalogue */

export const CATALOG = {
  productsPerPage: 48,
  productsPerPageMobile: 24,
  maxPagesIndexable: 5,
  railSize: 12,
  searchSuggestionLimit: 8,
  recentSearchLimit: 6,
  recentlyViewedLimit: 20,
  /** A product is "new" for this long after publishing. */
  newArrivalDays: 30,
  /** Units sold in 30 days to earn the bestseller badge. */
  bestsellerThreshold: 60,
  trendingViewThreshold: 2500,
  maxImagesPerProduct: 8,
  maxVideosPerProduct: 2,
  maxImageBytes: 5 * 1024 * 1024,
  maxVideoBytes: 50 * 1024 * 1024,
  acceptedImageTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  acceptedVideoTypes: ['video/mp4', 'video/webm'],
} as const;

/* --------------------------------------------------------------- accounts */

export const ACCOUNTS = {
  sessionTtlDays: 30,
  /** Sessions for staff and sellers expire faster. */
  staffSessionTtlHours: 12,
  passwordMinLength: 8,
  maxAddresses: 10,
  otpLength: 6,
  otpTtlMinutes: 10,
  maxLoginAttempts: 5,
  loginLockoutMinutes: 15,
} as const;

/* --------------------------------------------------------------- support */

export const SUPPORT = {
  slaHours: { LOW: 72, NORMAL: 48, HIGH: 24, URGENT: 4 },
  maxAttachments: 5,
  maxAttachmentBytes: 10 * 1024 * 1024,
} as const;

/* ------------------------------------------------------------------ tables */

export const TABLES = {
  defaultPageSize: 25,
  pageSizeOptions: [10, 25, 50, 100],
  maxExportRows: 10000,
  maxBulkSelection: 500,
} as const;

/* --------------------------------------------------------- Indian geography */

/** Metro pincode prefixes get the faster delivery promise. */
export const METRO_PINCODE_PREFIXES = ['11', '40', '56', '60', '70', '50', '38', '41'];

export const INDIAN_STATES = [
  'Andhra Pradesh',
  'Arunachal Pradesh',
  'Assam',
  'Bihar',
  'Chhattisgarh',
  'Delhi',
  'Goa',
  'Gujarat',
  'Haryana',
  'Himachal Pradesh',
  'Jharkhand',
  'Karnataka',
  'Kerala',
  'Madhya Pradesh',
  'Maharashtra',
  'Manipur',
  'Meghalaya',
  'Mizoram',
  'Nagaland',
  'Odisha',
  'Punjab',
  'Rajasthan',
  'Sikkim',
  'Tamil Nadu',
  'Telangana',
  'Tripura',
  'Uttar Pradesh',
  'Uttarakhand',
  'West Bengal',
  'Andaman and Nicobar Islands',
  'Chandigarh',
  'Dadra and Nagar Haveli and Daman and Diu',
  'Jammu and Kashmir',
  'Ladakh',
  'Lakshadweep',
  'Puducherry',
] as const;

export type IndianState = (typeof INDIAN_STATES)[number];

/**
 * GST state codes.
 *
 * The first two digits of a GSTIN encode the state of registration, so they
 * cannot be chosen independently of the registered address — a GSTIN beginning
 * 30 (Goa) on a Rajasthan address is the first thing a tax officer notices.
 */
export const GST_STATE_CODE: Record<string, string> = {
  'Jammu and Kashmir': '01',
  'Himachal Pradesh': '02',
  Punjab: '03',
  Chandigarh: '04',
  Uttarakhand: '05',
  Haryana: '06',
  Delhi: '07',
  Rajasthan: '08',
  'Uttar Pradesh': '09',
  Bihar: '10',
  Sikkim: '11',
  'Arunachal Pradesh': '12',
  Nagaland: '13',
  Manipur: '14',
  Mizoram: '15',
  Tripura: '16',
  Meghalaya: '17',
  Assam: '18',
  'West Bengal': '19',
  Jharkhand: '20',
  Odisha: '21',
  Chhattisgarh: '22',
  'Madhya Pradesh': '23',
  Gujarat: '24',
  'Dadra and Nagar Haveli and Daman and Diu': '26',
  Maharashtra: '27',
  Karnataka: '29',
  Goa: '30',
  Lakshadweep: '31',
  Kerala: '32',
  'Tamil Nadu': '33',
  Puducherry: '34',
  'Andaman and Nicobar Islands': '35',
  Telangana: '36',
  'Andhra Pradesh': '37',
  Ladakh: '38',
};

/** Falls back to the marketplace's own state for anything unmapped. */
export function gstStateCode(state: string): string {
  return GST_STATE_CODE[state.trim()] ?? GST_STATE_CODE[PRICING.originState] ?? '29';
}
