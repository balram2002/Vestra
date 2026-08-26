import { z } from 'zod';

import { INDIAN_STATES } from '@/config/business';

/**
 * Seller application validation.
 *
 * The checks here are the ones a marketplace is legally obliged to make before
 * letting somebody sell: a GSTIN and a PAN that are at least well-formed, a
 * registered address, and a bank account to settle into. Verifying that they
 * are GENUINE is a human job — this only stops the obviously wrong from
 * reaching the queue.
 */

/**
 * GSTIN: 2-digit state code, 10-character PAN, entity number, 'Z', checksum.
 * Checking the shape catches transposed digits; it does not prove the number
 * is registered, which is what the reviewer is for.
 */
const gstin = z
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

export const sellerApplicationSchema = z.object({
  /* ---- the store as shoppers will see it ---- */
  displayName: z
    .string()
    .trim()
    .min(3, 'Give your store a name')
    .max(60, 'Keep the store name under 60 characters'),
  tagline: z.string().trim().max(90).optional().or(z.literal('')),
  about: z
    .string()
    .trim()
    .min(40, 'Tell shoppers what you make in a couple of sentences')
    .max(1200),

  /* ---- the business behind it ---- */
  legalName: z.string().trim().min(3, 'Enter the registered business name').max(120),
  businessType: z.enum(['PROPRIETORSHIP', 'PARTNERSHIP', 'LLP', 'PRIVATE_LIMITED', 'INDIVIDUAL']),
  gstin,
  pan,

  /* ---- where goods are picked up from ---- */
  addressLine1: z.string().trim().min(4, 'Enter the pickup address'),
  addressLine2: z.string().trim().max(120).optional().or(z.literal('')),
  city: z.string().trim().min(2, 'Enter the city'),
  state: z.enum(INDIAN_STATES, { message: 'Choose the state' }),
  pincode: z.string().trim().regex(/^\d{6}$/, 'Enter a 6-digit pincode'),

  /* ---- how we reach them, and pay them ---- */
  supportEmail: z.string().trim().email('Enter a support email shoppers can write to'),
  supportPhone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, 'Enter a 10-digit Indian mobile number'),
  accountHolderName: z.string().trim().min(3, 'Enter the account holder name'),
  accountNumber: z
    .string()
    .trim()
    .regex(/^\d{9,18}$/, 'Enter the bank account number'),
  ifsc,
  bankName: z.string().trim().min(2, 'Enter the bank name'),

  /* ---- what they intend to sell ---- */
  categoryIds: z.array(z.string()).min(1, 'Choose at least one category you want to list in'),
});

export type SellerApplicationInput = z.infer<typeof sellerApplicationSchema>;

/**
 * Documents a reviewer needs before they can approve.
 *
 * The list is short on purpose: every extra document is another reason an
 * application stalls, and these four are the ones that actually establish who
 * is selling and where the money goes.
 */
export const REQUIRED_DOCUMENTS = [
  { type: 'GST_CERTIFICATE' as const, label: 'GST certificate' },
  { type: 'PAN_CARD' as const, label: 'PAN card' },
  { type: 'CANCELLED_CHEQUE' as const, label: 'Cancelled cheque or bank statement' },
  { type: 'ADDRESS_PROOF' as const, label: 'Proof of the pickup address' },
];

export type RequiredDocumentType = (typeof REQUIRED_DOCUMENTS)[number]['type'];

/** What is still missing before the application can be submitted for review. */
export function missingDocuments(uploaded: string[]): string[] {
  return REQUIRED_DOCUMENTS.filter((document) => !uploaded.includes(document.type)).map(
    (document) => document.label,
  );
}
