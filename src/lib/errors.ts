/**
 * A single error vocabulary shared by the domain server, the service clients and
 * the UI. Every failure carries a machine `code` so the interface can react
 * specifically (re-price the cart, re-authenticate, offer a retry) instead of
 * dumping a generic "Something went wrong".
 */

export type ErrorCode =
  // transport / auth
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'RATE_LIMITED'
  | 'CONFLICT'
  | 'VALIDATION_ERROR'
  | 'INTERNAL_ERROR'
  // catalogue
  | 'PRODUCT_UNAVAILABLE'
  | 'VARIANT_UNAVAILABLE'
  | 'SELLER_INACTIVE'
  // cart / checkout
  | 'CART_EMPTY'
  | 'PRICE_CHANGED'
  | 'OUT_OF_STOCK'
  | 'INSUFFICIENT_STOCK'
  | 'QUANTITY_LIMIT'
  | 'COUPON_INVALID'
  | 'COUPON_EXPIRED'
  | 'COUPON_LIMIT_REACHED'
  | 'COUPON_NOT_APPLICABLE'
  | 'ADDRESS_REQUIRED'
  | 'PINCODE_NOT_SERVICEABLE'
  | 'DELIVERY_UNAVAILABLE'
  // payment
  | 'PAYMENT_FAILED'
  | 'PAYMENT_TIMEOUT'
  | 'PAYMENT_CANCELLED'
  | 'PAYMENT_ALREADY_CAPTURED'
  | 'COD_NOT_ALLOWED'
  // fulfilment
  | 'ORDER_NOT_CANCELLABLE'
  | 'RETURN_WINDOW_CLOSED'
  | 'RETURN_NOT_ELIGIBLE'
  | 'EXCHANGE_VARIANT_UNAVAILABLE'
  | 'SHIPMENT_ERROR'
  | 'REFUND_FAILED';

export interface FieldIssue {
  field: string;
  message: string;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly issues: FieldIssue[];
  readonly details?: Record<string, unknown>;
  /** True when retrying the identical request could plausibly succeed. */
  readonly retryable: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    options: {
      status?: number;
      issues?: FieldIssue[];
      details?: Record<string, unknown>;
      retryable?: boolean;
    } = {},
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = options.status ?? defaultStatus(code);
    this.issues = options.issues ?? [];
    this.details = options.details;
    this.retryable = options.retryable ?? RETRYABLE.has(code);
  }
}

const RETRYABLE = new Set<ErrorCode>([
  'NETWORK_ERROR',
  'TIMEOUT',
  'INTERNAL_ERROR',
  'RATE_LIMITED',
  'PAYMENT_TIMEOUT',
  'SHIPMENT_ERROR',
]);

function defaultStatus(code: ErrorCode): number {
  switch (code) {
    case 'UNAUTHENTICATED':
      return 401;
    case 'FORBIDDEN':
      return 403;
    case 'NOT_FOUND':
      return 404;
    case 'CONFLICT':
    case 'PRICE_CHANGED':
    case 'OUT_OF_STOCK':
    case 'INSUFFICIENT_STOCK':
      return 409;
    case 'VALIDATION_ERROR':
      return 422;
    case 'RATE_LIMITED':
      return 429;
    case 'NETWORK_ERROR':
    case 'TIMEOUT':
    case 'INTERNAL_ERROR':
      return 500;
    default:
      return 400;
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

export function errorCodeOf(value: unknown): ErrorCode {
  return isAppError(value) ? value.code : 'INTERNAL_ERROR';
}

/**
 * Copy shown to the person in front of the screen. Deliberately actionable:
 * it says what happened AND what to do next.
 */
const MESSAGES: Partial<Record<ErrorCode, string>> = {
  NETWORK_ERROR: 'We could not reach Vestra. Check your connection and try again.',
  TIMEOUT: 'That took longer than expected. Please try again.',
  UNAUTHENTICATED: 'Please sign in to continue.',
  FORBIDDEN: 'You do not have permission to do this.',
  NOT_FOUND: 'We could not find what you were looking for.',
  RATE_LIMITED: 'Too many attempts. Please wait a moment and try again.',
  VALIDATION_ERROR: 'Please correct the highlighted fields.',
  INTERNAL_ERROR: 'Something went wrong on our side. Please try again.',
  PRODUCT_UNAVAILABLE: 'This product is no longer available.',
  VARIANT_UNAVAILABLE: 'That size or colour is no longer available.',
  SELLER_INACTIVE: 'This seller is not accepting orders right now.',
  CART_EMPTY: 'Your bag is empty.',
  PRICE_CHANGED: 'Prices in your bag have changed. Review the updated total before paying.',
  OUT_OF_STOCK: 'This item just went out of stock.',
  INSUFFICIENT_STOCK: 'We do not have enough stock for the quantity you selected.',
  QUANTITY_LIMIT: 'You have reached the maximum quantity allowed for this item.',
  COUPON_INVALID: 'That coupon code is not valid.',
  COUPON_EXPIRED: 'That coupon has expired.',
  COUPON_LIMIT_REACHED: 'That coupon has reached its usage limit.',
  COUPON_NOT_APPLICABLE: 'That coupon does not apply to the items in your bag.',
  ADDRESS_REQUIRED: 'Add a delivery address to continue.',
  PINCODE_NOT_SERVICEABLE: 'We do not deliver to this pincode yet.',
  DELIVERY_UNAVAILABLE: 'No delivery option is available for this address.',
  PAYMENT_FAILED: 'Your payment did not go through. No money was deducted.',
  PAYMENT_TIMEOUT: 'We are still confirming your payment. Do not pay again.',
  PAYMENT_CANCELLED: 'Payment was cancelled.',
  COD_NOT_ALLOWED: 'Cash on delivery is not available for this order.',
  ORDER_NOT_CANCELLABLE: 'This order can no longer be cancelled. You can request a return after delivery.',
  RETURN_WINDOW_CLOSED: 'The return window for this item has closed.',
  RETURN_NOT_ELIGIBLE: 'This item is not eligible for return.',
  EXCHANGE_VARIANT_UNAVAILABLE: 'The size you asked for is out of stock. Try a different size or return instead.',
  SHIPMENT_ERROR: 'We could not reach the courier. Please try again.',
  REFUND_FAILED: 'The refund could not be processed. Our team has been notified.',
};

export function userMessage(value: unknown): string {
  if (isAppError(value)) return MESSAGES[value.code] ?? value.message;
  if (value instanceof Error && value.message) return value.message;
  return MESSAGES.INTERNAL_ERROR!;
}

export const errorMessages = MESSAGES;
