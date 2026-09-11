import { z } from 'zod';

import { INDIAN_STATES } from '@/config/business';

/**
 * Seller validation.
 *
 * Two stages, deliberately. Applying asks only what it takes to decide whether
 * a business belongs on the marketplace: who they are, how to reach them and
 * what they sell. What a store needs in order to trade (a pickup address before
 * its first parcel, tax numbers for its invoices, a bank account for its first
 * payout) is asked for in the console when it is needed, not all at once on the
 * doorstep, where every extra field is another reason to leave.
 *
 * These are shape checks. Whether a GSTIN is genuine is a person's job.
 */

/** GSTIN: 2-digit state code, 10-character PAN, entity number, 'Z', checksum. */
export const gstinSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(
    /^[0-3][0-9][A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/,
    'That does not look like a GSTIN. It is 15 characters, starting with your state code.',
  );

/** PAN: five letters, four digits, one letter. */
const pan = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'A PAN is five letters, four digits and one letter.');

const ifsc = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'An IFSC is four letters, a zero, then six characters.');

const mobile = z
  .string()
  .trim()
  .regex(/^[6-9]\d{9}$/, 'Enter a 10-digit Indian mobile number');

export const BUSINESS_TYPES = [
  { value: 'INDIVIDUAL', label: 'Individual' },
  { value: 'PROPRIETORSHIP', label: 'Sole proprietorship' },
  { value: 'PARTNERSHIP', label: 'Partnership firm' },
  { value: 'LLP', label: 'Limited liability partnership' },
  { value: 'PRIVATE_LIMITED', label: 'Private limited company' },
] as const;

const businessType = z.enum(['INDIVIDUAL', 'PROPRIETORSHIP', 'PARTNERSHIP', 'LLP', 'PRIVATE_LIMITED'], {
  message: 'Choose your business type',
});

/* ---------------------------------------------------------------- applying */

export const sellerApplicationSchema = z.object({
  displayName: z
    .string()
    .trim()
    .min(3, 'Give your store a name')
    .max(60, 'Keep the store name under 60 characters'),
  businessType,
  supportEmail: z.string().trim().email('Enter an email we can reach you on'),
  supportPhone: mobile,
  city: z.string().trim().min(2, 'Enter your city').max(60),
  state: z.enum(INDIAN_STATES, { message: 'Choose your state' }),
  categoryIds: z.array(z.string().min(1)).min(1, 'Choose at least one thing you sell'),
  /** Optional now; a store adds it in the console before its first invoice. */
  gstin: z.union([z.literal(''), gstinSchema]),
});

export type SellerApplicationInput = z.infer<typeof sellerApplicationSchema>;

/* ------------------------------------------------- later, in the console */

export const storeProfileSchema = z.object({
  tagline: z.string().trim().max(90, 'Keep the tagline under 90 characters'),
  about: z.string().trim().max(1200, 'Keep it under 1,200 characters'),
  supportEmail: z.string().trim().email('Enter an email shoppers can write to'),
  supportPhone: mobile,
});

export const businessDetailsSchema = z.object({
  legalName: z.string().trim().min(3, 'Enter the registered business name').max(120),
  businessType,
  gstin: z.union([z.literal(''), gstinSchema]),
  pan: z.union([z.literal(''), pan]),
});

export const pickupAddressSchema = z.object({
  contactName: z.string().trim().min(2, 'Who should the courier ask for?').max(80),
  phone: mobile,
  line1: z.string().trim().min(4, 'Enter the street address').max(120),
  line2: z.string().trim().max(120),
  city: z.string().trim().min(2, 'Enter the city').max(60),
  state: z.enum(INDIAN_STATES, { message: 'Choose the state' }),
  pincode: z.string().trim().regex(/^\d{6}$/, 'Enter a 6-digit pincode'),
});

export const bankAccountSchema = z.object({
  accountHolderName: z.string().trim().min(3, 'Enter the name on the account').max(80),
  accountNumber: z
    .string()
    .trim()
    .regex(/^\d{9,18}$/, 'Enter the account number: 9 to 18 digits'),
  ifsc,
  bankName: z.string().trim().min(2, 'Enter the bank name').max(80),
});

export type StoreProfileInput = z.infer<typeof storeProfileSchema>;
export type BusinessDetailsInput = z.infer<typeof businessDetailsSchema>;
export type PickupAddressInput = z.infer<typeof pickupAddressSchema>;
export type BankAccountInput = z.infer<typeof bankAccountSchema>;

/* --------------------------------------------------------------- documents */

/**
 * Documents a store can keep on file for verification.
 *
 * None is needed to apply. They are what a reviewer checks the GSTIN, the bank
 * account and the pickup address against when verification is due.
 */
export const VERIFICATION_DOCUMENTS = [
  { type: 'GST_CERTIFICATE' as const, label: 'GST certificate' },
  { type: 'PAN_CARD' as const, label: 'PAN card' },
  { type: 'CANCELLED_CHEQUE' as const, label: 'Cancelled cheque or bank statement' },
  { type: 'ADDRESS_PROOF' as const, label: 'Proof of the pickup address' },
];

export type VerificationDocumentType = (typeof VERIFICATION_DOCUMENTS)[number]['type'];
