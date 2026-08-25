import { z } from 'zod';

import { GENDERS } from '@/domain/attributes';
import { CATALOG } from '@/config/business';

/**
 * Listing validation.
 *
 * Two distinct standards, which is the point of splitting them:
 *
 *  - `draftSchema` is what it takes to SAVE. A seller half way through typing
 *    must be able to keep their work, so almost everything is optional.
 *  - `submissionSchema` is what it takes to be REVIEWED. That is where the
 *    catalogue's actual requirements live.
 *
 * Collapsing the two is the usual mistake: it either lets incomplete listings
 * into the review queue, or refuses to save a draft until it is perfect.
 */

const money = z
  .number()
  .int('Enter a whole number of rupees')
  .min(0, 'Cannot be negative')
  .max(100_000_000, 'That price looks wrong');

export const variantInputSchema = z.object({
  id: z.string().optional(),
  size: z.string().min(1, 'Size is required').max(24),
  color: z.string().min(1, 'Colour is required').max(40),
  /** Paise. */
  mrp: money,
  sellingPrice: money,
  available: z.number().int().min(0).max(100_000),
  sellerSku: z.string().max(60).optional(),
  isActive: z.boolean().default(true),
});

export type VariantInput = z.infer<typeof variantInputSchema>;

export const draftSchema = z.object({
  title: z.string().trim().min(1, 'Give the style a title').max(140),
  brandId: z.string().min(1, 'Choose a brand').optional().or(z.literal('')),
  categoryId: z.string().min(1, 'Choose a category').optional().or(z.literal('')),
  gender: z.enum(GENDERS).optional(),
  description: z.string().max(4000).optional(),
  highlights: z.array(z.string().max(160)).max(8).optional(),
  attributes: z.record(z.string(), z.union([z.string(), z.array(z.string())])).optional(),
  careInstructions: z.array(z.string()).max(12).optional(),
  countryOfOrigin: z.string().max(60).optional(),
  manufacturerName: z.string().max(160).optional(),
  manufacturerAddress: z.string().max(300).optional(),
  netQuantity: z.string().max(60).optional(),
  hsnCode: z.string().max(12).optional(),
  returnable: z.boolean().optional(),
  returnWindowDays: z.number().int().min(0).max(60).optional(),
  exchangeable: z.boolean().optional(),
  codAvailable: z.boolean().optional(),
  metaTitle: z.string().max(70).optional(),
  metaDescription: z.string().max(180).optional(),
});

export type DraftInput = z.infer<typeof draftSchema>;

/**
 * What a listing needs before a catalogue manager should be asked to look at
 * it. Each failure is phrased as the thing to DO, not the field that is empty.
 */
export interface Blocker {
  field: string;
  message: string;
}

export interface ReadinessInput {
  title: string;
  brandId: string;
  categoryId: string;
  description: string;
  mediaCount: number;
  variants: Array<{ mrp: number; sellingPrice: number; available: number; isActive: boolean }>;
  requiredAttributes: string[];
  attributes: Record<string, string | string[]>;
}

export function readinessBlockers(input: ReadinessInput): Blocker[] {
  const blockers: Blocker[] = [];

  if (input.title.trim().length < 8) {
    blockers.push({ field: 'title', message: 'Write a fuller title — shoppers search on it.' });
  }
  if (!input.brandId) blockers.push({ field: 'brandId', message: 'Choose a brand.' });
  if (!input.categoryId) blockers.push({ field: 'categoryId', message: 'Choose a category.' });

  if (input.description.trim().length < 40) {
    blockers.push({
      field: 'description',
      message: 'Describe the fabric, fit and finish in a couple of sentences.',
    });
  }

  if (input.mediaCount < 1) {
    blockers.push({ field: 'media', message: 'Add at least one photo.' });
  }

  const active = input.variants.filter((variant) => variant.isActive);
  if (active.length === 0) {
    blockers.push({ field: 'variants', message: 'Add at least one size.' });
  }

  // A listing nobody can buy is worse than no listing: it takes the search
  // slot and returns an out-of-stock page.
  if (active.length > 0 && active.every((variant) => variant.available === 0)) {
    blockers.push({ field: 'variants', message: 'Every size is out of stock. Add stock to at least one.' });
  }

  for (const variant of active) {
    if (variant.sellingPrice <= 0) {
      blockers.push({ field: 'variants', message: 'Every size needs a selling price.' });
      break;
    }
  }
  for (const variant of active) {
    // A selling price above MRP is not a discount, it is a legal problem.
    if (variant.sellingPrice > variant.mrp) {
      blockers.push({
        field: 'variants',
        message: 'Selling price cannot be higher than MRP on any size.',
      });
      break;
    }
  }

  for (const key of input.requiredAttributes) {
    const value = input.attributes[key];
    const missing = Array.isArray(value) ? value.length === 0 : !value;
    if (missing) {
      blockers.push({ field: `attributes.${key}`, message: `Set the ${key} for this style.` });
    }
  }

  return blockers;
}

export const mediaLimits = {
  maxImages: CATALOG.maxImagesPerProduct,
  maxVideos: CATALOG.maxVideosPerProduct,
  maxImageBytes: CATALOG.maxImageBytes,
  maxVideoBytes: CATALOG.maxVideoBytes,
  acceptedImageTypes: CATALOG.acceptedImageTypes,
  acceptedVideoTypes: CATALOG.acceptedVideoTypes,
};
