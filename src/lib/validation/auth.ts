import { z } from 'zod';

import { ACCOUNTS } from '@/config/business';
import { isCommonPassword } from '@/domain/password-strength';

/**
 * Auth schemas.
 *
 * Shared verbatim between the client form and the Server Action, so the rules a
 * shopper sees enforced as they type are exactly the rules the server applies.
 * Two copies of "password must be 8 characters" is how they end up disagreeing.
 */

export const emailSchema = z
  .string()
  .trim()
  .min(1, 'Enter your email address')
  .email('That does not look like an email address')
  .toLowerCase();

export const passwordSchema = z
  .string()
  .min(ACCOUNTS.passwordMinLength, `Use at least ${ACCOUNTS.passwordMinLength} characters`)
  .max(128, 'That password is too long')
  .refine((value) => !isCommonPassword(value), 'Choose a less common password');

export const loginSchema = z.object({
  email: emailSchema,
  // Deliberately NOT `passwordSchema`: rejecting a short password at sign-in
  // tells an attacker the rules and helps nobody. Any non-empty value is
  // accepted and simply fails to match.
  password: z.string().min(1, 'Enter your password'),
  next: z.string().optional(),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z.object({
  fullName: z
    .string()
    .trim()
    .min(2, 'Enter your name')
    .max(80, 'That name is too long'),
  email: emailSchema,
  password: passwordSchema,
  phone: z
    .string()
    .trim()
    .regex(/^[6-9]\d{9}$/, 'Enter a 10-digit Indian mobile number')
    .optional()
    .or(z.literal('')),
  marketingOptIn: z.boolean().default(false),
});

export type RegisterInput = z.infer<typeof registerSchema>;

/**
 * Asking for a reset link.
 *
 * Only the address is validated, and only for shape. Whether an account exists
 * is deliberately never revealed — see `requestPasswordReset`.
 */
export const passwordResetRequestSchema = z.object({
  email: emailSchema,
});

export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;

/**
 * Choosing a new password.
 *
 * Reuses `passwordSchema`, so the rule a new password must satisfy is the same
 * one registration applies — two different minimum lengths in one product is
 * how the weaker of them becomes the real one.
 */
export const passwordResetSchema = z.object({
  token: z.string().min(1, 'That link is incomplete.'),
  password: passwordSchema,
});

export type PasswordResetInput = z.infer<typeof passwordResetSchema>;
