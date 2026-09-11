import type { AccountStatus, SellerStatus, UserRole } from '../enums';

/* ------------------------------------------------------------------- users */

export interface User {
  id: string;
  email: string;
  emailVerified: boolean;
  phone: string | null;
  phoneVerified: boolean;
  fullName: string;
  /** Stored as a hash. The plaintext never leaves the sign-in Server Action. */
  passwordHash: string;
  roles: UserRole[];
  status: AccountStatus;
  avatarUrl: string | null;
  gender: 'MALE' | 'FEMALE' | 'OTHER' | 'UNDISCLOSED' | null;
  dateOfBirth: string | null;
  /** Seller staff and sellers are scoped to exactly one store. */
  sellerId: string | null;
  createdAt: string;
  updatedAt: string;
  lastLoginAt: string | null;
  /** Loyalty / refund wallet balance in paise. */
  creditBalance: number;
  preferences: UserPreferences;
}

export interface UserPreferences {
  /** Channel opt-ins, keyed by notification category. */
  notifications: Record<string, { inApp: boolean; email: boolean; sms: boolean; push: boolean }>;
  marketingOptIn: boolean;
  theme: 'light' | 'dark' | 'system';
  preferredSizes: Record<string, string>;
  language: string;
  currency: string;
}

/** The safe projection. Anything returned to a client component uses this. */
export interface PublicUser {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  roles: UserRole[];
  status: AccountStatus;
  avatarUrl: string | null;
  sellerId: string | null;
  creditBalance: number;
  emailVerified: boolean;
  phoneVerified: boolean;
}

export interface Session {
  userId: string;
  /** The role the session is currently acting as, for multi-role staff. */
  activeRole: UserRole;
  sellerId: string | null;
  issuedAt: number;
  expiresAt: number;
}

export interface SessionUser extends PublicUser {
  activeRole: UserRole;
  permissions: Permission[];
}

/* --------------------------------------------------------------- addresses */

export type AddressLabel = 'HOME' | 'WORK' | 'OTHER';

export interface Address {
  id: string;
  userId: string;
  label: AddressLabel;
  fullName: string;
  phone: string;
  alternatePhone: string | null;
  line1: string;
  line2: string | null;
  landmark: string | null;
  city: string;
  state: string;
  pincode: string;
  country: string;
  isDefault: boolean;
  isBillingDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

/** A pickup or warehouse address owned by a seller, not a customer. */
export interface SellerLocation {
  id: string;
  sellerId: string;
  name: string;
  contactName: string;
  phone: string;
  line1: string;
  line2: string | null;
  city: string;
  state: string;
  pincode: string;
  country: string;
  /**
   * Where the shop actually is.
   *
   * Added for live commerce: the matcher ranks shops by how far they are from
   * the shopper, and a pincode cannot answer that — two addresses in 201301 can
   * be nine kilometres apart, which is the difference between "round the
   * corner" and "not local at all".
   *
   * Nullable because it is geocoded rather than typed in, and a seller whose
   * address has not resolved yet must still be able to sell. A location with no
   * coordinates is simply never matched for a live call.
   */
  latitude: number | null;
  longitude: number | null;
  /** Eshopbox facility code once the location is registered with the 3PL. */
  eshopboxFacilityCode: string | null;
  isPrimary: boolean;
  isPickupEnabled: boolean;
  isReturnAddress: boolean;
}

/* ----------------------------------------------------------------- sellers */

export interface Seller {
  id: string;
  /** Short uppercase code used in SKUs, invoice numbers and settlements. */
  code: string;
  slug: string;
  /** Older slugs kept so inbound links keep resolving via a 301. */
  slugHistory: string[];
  legalName: string;
  displayName: string;
  tagline: string | null;
  about: string;
  logoUrl: string;
  bannerUrl: string;
  status: SellerStatus;
  ownerUserId: string;
  supportEmail: string;
  supportPhone: string;
  kyc: SellerKyc;
  bank: SellerBankAccount;
  commissionPlanId: string;
  /** Categories the seller is approved to list in. */
  approvedCategoryIds: string[];
  rating: SellerRating;
  policies: SellerPolicies;
  metrics: SellerMetrics;
  joinedAt: string;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SellerKyc {
  gstin: string;
  pan: string;
  businessType: 'PROPRIETORSHIP' | 'PARTNERSHIP' | 'LLP' | 'PRIVATE_LIMITED' | 'INDIVIDUAL';
  registeredAddress: Omit<SellerLocation, 'id' | 'sellerId' | 'isPrimary' | 'isPickupEnabled' | 'isReturnAddress' | 'eshopboxFacilityCode'>;
  documents: KycDocument[];
  verifiedAt: string | null;
  verifiedByUserId: string | null;
  rejectionReason: string | null;
}

export interface KycDocument {
  id: string;
  type: 'GST_CERTIFICATE' | 'PAN_CARD' | 'CANCELLED_CHEQUE' | 'ADDRESS_PROOF' | 'TRADEMARK' | 'SIGNATURE';
  fileName: string;
  fileUrl: string;
  uploadedAt: string;
  status: 'PENDING' | 'VERIFIED' | 'REJECTED';
  note: string | null;
}

export interface SellerBankAccount {
  accountHolderName: string;
  /** Only the last four digits are ever returned to a client component. */
  accountNumberMasked: string;
  ifsc: string;
  bankName: string;
  branch: string;
  verified: boolean;
}

export interface SellerRating {
  average: number;
  count: number;
  /** Operational scores that feed the seller scorecard, 0-100. */
  fulfilmentScore: number;
  cancellationRate: number;
  returnRate: number;
  onTimeDispatchRate: number;
  responseTimeHours: number;
}

export interface SellerPolicies {
  returnWindowDays: number;
  exchangeWindowDays: number;
  /** Categories excluded from returns, e.g. innerwear, beauty. */
  nonReturnableCategoryIds: string[];
  codEnabled: boolean;
  /** Free shipping above this cart value, in paise. Null means never. */
  freeShippingThreshold: number | null;
  dispatchSlaHours: number;
  shippingNote: string;
  returnNote: string;
}

export interface SellerMetrics {
  productCount: number;
  liveProductCount: number;
  orderCount: number;
  followerCount: number;
  lifetimeGmv: number;
}

export interface SellerFollow {
  id: string;
  sellerId: string;
  userId: string;
  createdAt: string;
}

/* -------------------------------------------------------------------- RBAC */

/**
 * Permissions are `resource:action` pairs. Every server data-access function
 * asserts one; the UI merely hides what the caller could not have used anyway.
 */
export const PERMISSIONS = [
  'catalog:read',
  'catalog:write',
  'catalog:approve',
  'catalog:delete',
  'order:read',
  'order:read:own',
  'order:write',
  'order:cancel',
  'order:refund',
  'shipment:read',
  'shipment:write',
  'inventory:read',
  'inventory:write',
  'return:read',
  'return:approve',
  'refund:approve',
  'coupon:read',
  'coupon:write',
  'promotion:write',
  'cms:write',
  'user:read',
  'user:write',
  'user:suspend',
  'seller:read',
  'seller:write',
  'seller:approve',
  'seller:suspend',
  'finance:read',
  'finance:payout',
  'settlement:read',
  'analytics:read',
  'analytics:read:own',
  'review:moderate',
  'support:read',
  'support:write',
  'audit:read',
  'settings:write',
  'role:write',
  'export:data',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export interface Role {
  id: string;
  key: UserRole;
  name: string;
  description: string;
  permissions: Permission[];
  /** Built-in roles cannot be deleted, only cloned. */
  system: boolean;
  userCount: number;
}

/**
 * A single-use, expiring token behind an email link.
 *
 * Only the SHA-256 of the token is ever stored — the raw value exists once, in
 * the email that carries it. See `server/auth/tokens.ts`.
 */
export interface AuthToken {
  id: string;
  userId: string;
  purpose: 'EMAIL_VERIFICATION' | 'PASSWORD_RESET';
  hash: string;
  expiresAt: string;
  consumedAt: string | null;
  createdAt: string;
}
