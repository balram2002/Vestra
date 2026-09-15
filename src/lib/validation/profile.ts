import { z } from 'zod';

import { SIZE_SCALES, type SizeSystem } from '@/domain/attributes';

/**
 * Profile and preferences.
 *
 * Shared by the profile forms and the Server Actions behind them, like the
 * auth schemas beside this file: what the form lets someone type is exactly
 * what the server agrees to store.
 *
 * Optional fields are refinements on a plain string rather than a union with
 * an empty literal. A union reports "Invalid input" when both branches fail,
 * and the person looking at the field needs the reason, not the parser's.
 */

/* ---------------------------------------------------------------- details */

export const GENDER_OPTIONS = [
  { value: 'FEMALE', label: 'Woman' },
  { value: 'MALE', label: 'Man' },
  { value: 'OTHER', label: 'Another identity' },
  { value: 'UNDISCLOSED', label: 'Prefer not to say' },
] as const;

const GENDER_VALUES: readonly string[] = GENDER_OPTIONS.map((option) => option.value);

/** Nobody under this age may hold an account. */
export const MIN_AGE = 13;
const MAX_AGE = 120;

/**
 * Whole years between a `YYYY-MM-DD` birthday and `today`, or null for a date
 * that does not exist -- 30 February is a string, not a birthday.
 *
 * Negative for a date in the future, which the schema reports as exactly that
 * rather than as "too young".
 */
export function ageOn(dateOfBirth: string, today: Date = new Date()): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOfBirth);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]) - 1;
  const day = Number(match[3]);
  const born = new Date(Date.UTC(year, month, day));
  if (born.getUTCFullYear() !== year || born.getUTCMonth() !== month || born.getUTCDate() !== day) {
    return null;
  }

  const age = today.getUTCFullYear() - year;
  const beforeBirthday =
    today.getUTCMonth() < month || (today.getUTCMonth() === month && today.getUTCDate() < day);
  return beforeBirthday ? age - 1 : age;
}

const dateOfBirth = z
  .string()
  .trim()
  .refine((value) => value === '' || ageOn(value) !== null, 'Enter a real date, like 1994-08-21')
  .refine((value) => value === '' || (ageOn(value) ?? 0) >= 0, 'That date is in the future')
  .refine(
    (value) => value === '' || (ageOn(value) ?? MIN_AGE) >= MIN_AGE,
    `You need to be ${MIN_AGE} or older to have an account`,
  )
  .refine((value) => value === '' || (ageOn(value) ?? 0) <= MAX_AGE, 'Check the year');

export const profileSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter your name').max(80, 'That name is too long'),
  phone: z
    .string()
    .trim()
    .refine(
      (value) => value === '' || /^[6-9]\d{9}$/.test(value),
      'Enter a 10-digit Indian mobile number, or leave it blank',
    )
    .optional(),
  gender: z
    .string()
    .refine((value) => value === '' || GENDER_VALUES.includes(value), 'Choose one of the options')
    .optional(),
  dateOfBirth: dateOfBirth.optional(),
});

export type ProfileInput = z.input<typeof profileSchema>;

/* ------------------------------------------------------------ preferences */

/**
 * The size scales worth asking about, in the words a shopper uses.
 *
 * Not every scale: "One size" and bottle volumes have nothing to prefer.
 */
export const PREFERENCE_SIZE_SYSTEMS: ReadonlyArray<{
  system: SizeSystem;
  label: string;
  hint: string;
}> = [
  { system: 'ALPHA', label: 'Tops, shirts and dresses', hint: 'XS to 5XL' },
  { system: 'NUMERIC_WAIST', label: 'Jeans and trousers', hint: 'Waist, in inches' },
  { system: 'INDIAN_WOMENS', label: 'Kurtas and Indian wear', hint: 'Indian size' },
  { system: 'FOOTWEAR_UK', label: 'Shoes', hint: 'UK / India' },
  { system: 'KIDS_AGE', label: "Kids' clothing", hint: 'By age' },
  { system: 'FOOTWEAR_KIDS', label: "Kids' shoes", hint: 'UK kids' },
];

/**
 * Only real sizes, on scales that are asked about.
 *
 * Blank means "no preference" and is dropped rather than stored. Null when
 * anything is not a real size, so a forged request is refused whole instead of
 * half-saved.
 */
export function cleanPreferredSizes(input: Record<string, string>): Record<string, string> | null {
  const clean: Record<string, string> = {};
  for (const [system, size] of Object.entries(input)) {
    if (!size) continue;
    const asked = PREFERENCE_SIZE_SYSTEMS.some((entry) => entry.system === system);
    if (!asked || !SIZE_SCALES[system as SizeSystem].sizes.includes(size)) return null;
    clean[system] = size;
  }
  return clean;
}

export const preferencesSchema = z.object({
  marketingOptIn: z.boolean(),
  preferredSizes: z
    .record(z.string(), z.string())
    .refine((sizes) => cleanPreferredSizes(sizes) !== null, 'Choose sizes from the lists')
    .transform((sizes) => cleanPreferredSizes(sizes) ?? {}),
});
