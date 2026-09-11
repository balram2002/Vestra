import { z } from 'zod';

import { INDIAN_STATES } from '@/config/business';

/**
 * One address rule, for the address book and anything else that saves one.
 *
 * Two copies of "a pincode is six digits" is how a form accepts what the
 * server then refuses.
 */

export const ADDRESS_LABELS = ['HOME', 'WORK', 'OTHER'] as const;

const mobile = /^[6-9]\d{9}$/;

export const addressSchema = z.object({
  label: z.enum(ADDRESS_LABELS),
  fullName: z.string().trim().min(2, 'Enter the full name').max(80, 'That name is too long'),
  phone: z.string().trim().regex(mobile, 'Enter a 10-digit Indian mobile number'),
  alternatePhone: z
    .string()
    .trim()
    .regex(mobile, 'Enter a 10-digit mobile number, or leave it blank')
    .optional()
    .or(z.literal('')),
  line1: z.string().trim().min(4, 'Enter the house, building and street').max(160),
  line2: z.string().trim().max(160).optional().or(z.literal('')),
  landmark: z.string().trim().max(120).optional().or(z.literal('')),
  city: z.string().trim().min(2, 'Enter the city').max(80),
  state: z.enum(INDIAN_STATES, { message: 'Choose the state' }),
  // Indian pincodes never start with zero.
  pincode: z.string().trim().regex(/^[1-9]\d{5}$/, 'Enter a 6-digit pincode'),
  isDefault: z.boolean(),
});

export type AddressInput = z.infer<typeof addressSchema>;