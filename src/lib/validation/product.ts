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

/**
 * The short form.
 *
 * What it takes to put a product in the shop in one sitting, which is a much
 * shorter list than what the long form asks for. A seller adding their first
 * product needs a name, where it belongs, a price, stock and a photograph --
 * everything else has a sensible default and can be filled in later from the
 * listing page.
 *
 * Prices are PAISE, like every other price in the system.
 */
export const quickListingSchema = z.object({
  title: z.string().trim().min(3, 'Give the product a name').max(140),
  brandId: z.string().min(1, 'Choose a brand, or add yours'),
  categoryId: z.string().min(1, 'Choose a category'),
  gender: z.enum(GENDERS).optional(),
  description: z.string().trim().max(4000).optional(),
  mrp: money,
  sellingPrice: money,
  stock: z.number().int().min(0, 'Cannot be negative').max(100_000),
  /** Empty means one size, which is most of homeware, beauty and accessories. */
  sizes: z.array(z.string().trim().min(1).max(24)).max(24),
  color: z.string().trim().min(1).max(40),
  returnable: z.boolean().optional(),
  codAvailable: z.boolean().optional(),
});

export type QuickListingInput = z.infer<typeof quickListingSchema>;

export interface PublishReadiness {
  title: string;
  brandId: string;
  categoryId: string;
  mediaCount: number;
  variants: Array<{ mrp: number; sellingPrice: number; available: number; isActive: boolean }>;
}

/**
 * What stands between a listing and the shop.
 *
 * Deliberately shorter than `readinessBlockers`, which is the standard for the
 * old review queue. A seller publishes their own listings now, so this checks
 * only what makes a listing WORK -- something to show, something to buy, and a
 * price that is not a legal problem. Copy quality is not a gate; an empty
 * description sells badly, which is the seller's business, not a blocker.
 */
export function publishBlockers(input: PublishReadiness): Blocker[] {
  const blockers: Blocker[] = [];

  if (input.title.trim().length < 3) {
    blockers.push({ field: 'title', message: 'Give the product a name.' });
  }
  if (!input.brandId) blockers.push({ field: 'brandId', message: 'Choose a brand, or add yours.' });
  if (!input.categoryId) blockers.push({ field: 'categoryId', message: 'Choose a category.' });
  if (input.mediaCount < 1) blockers.push({ field: 'media', message: 'Add at least one photo.' });

  const active = input.variants.filter((variant) => variant.isActive);
  if (active.length === 0) {
    blockers.push({ field: 'variants', message: 'Add a price and stock.' });
    return blockers;
  }

  if (active.every((variant) => variant.available === 0)) {
    blockers.push({ field: 'stock', message: 'Add stock to at least one size.' });
  }
  if (active.some((variant) => variant.sellingPrice <= 0)) {
    blockers.push({ field: 'sellingPrice', message: 'Set a selling price.' });
  }
  // A selling price above MRP is not a discount, it is a legal problem.
  if (active.some((variant) => variant.sellingPrice > variant.mrp)) {
    blockers.push({ field: 'sellingPrice', message: 'Selling price cannot be above MRP.' });
  }

  return blockers;
}
