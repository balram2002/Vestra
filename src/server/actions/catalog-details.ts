'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { requirePermission } from '../auth/session';
import { collections, toEntity } from '../db/collections';
import * as audit from '../services/audit';
import { invalidate } from '../services/cache-invalidation';
import { tags } from '../services/cache-tags';

/**
 * Editing a brand or a category after it exists.
 *
 * Both are created elsewhere -- by staff, or by a seller who needed one to
 * list. This is what makes them presentable afterwards: the name, the
 * description shoppers read on the page, and the PICTURE, which until now could
 * only be set by whatever created the record.
 *
 * THE SLUG NEVER FOLLOWS THE NAME. Renaming "Kurtas" to "Kurtas & Sets" must
 * not move /category/kurtas: every inbound link, every search result and every
 * share of that page would die for a copy edit. Slugs change deliberately or
 * not at all.
 */

export interface DetailsResult {
  ok: boolean;
  error?: string;
  field?: string;
}

const image = z
  .string()
  .trim()
  .max(600)
  .refine((value) => value === '' || value.startsWith('/') || /^https:\/\//.test(value), {
    message: 'Use an uploaded picture, or an https:// link.',
  });

const brandSchema = z.object({
  brandId: z.string().min(1),
  name: z.string().trim().min(2, 'Give the brand a name.').max(80),
  description: z.string().trim().max(400),
  logoUrl: image,
  bannerUrl: image,
  isPremium: z.boolean(),
  isActive: z.boolean(),
});

export async function updateBrandDetails(
  input: z.input<typeof brandSchema>,
): Promise<DetailsResult> {
  const actor = await requirePermission('catalog:write');

  const parsed = brandSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message, field: String(issue?.path?.[1] ?? issue?.path?.[0] ?? '') };
  }
  const data = parsed.data;

  const brands = await collections.brands();
  const brand = toEntity(await brands.findOne({ _id: data.brandId }));
  if (!brand) return { ok: false, error: 'Brand not found.' };

  const patch = {
    name: data.name,
    description: data.description || brand.description,
    logoUrl: data.logoUrl || brand.logoUrl,
    bannerUrl: data.bannerUrl || null,
    isPremium: data.isPremium,
    isActive: data.isActive,
    updatedAt: new Date().toISOString(),
  };

  await brands.updateOne({ _id: data.brandId }, { $set: patch });
  invalidate([tags.brandList, tags.brand(brand.slug)]);

  await audit.record({
    actor,
    action: 'brand.update',
    entityType: 'brand',
    entityId: brand.id,
    entityLabel: data.name,
    changes: audit.diff(brand, patch, ['name', 'logoUrl', 'isActive', 'isPremium']),
    severity: 'INFO',
  });

  revalidatePath('/admin/brands');
  revalidatePath(`/brand/${brand.slug}`);
  return { ok: true };
}

const categorySchema = z.object({
  categoryId: z.string().min(1),
  name: z.string().trim().min(2, 'Give it a name.').max(60),
  description: z.string().trim().max(300),
  imageUrl: image,
  bannerUrl: image,
  featured: z.boolean(),
  isActive: z.boolean(),
});

export async function updateCategoryDetails(
  input: z.input<typeof categorySchema>,
): Promise<DetailsResult> {
  const actor = await requirePermission('catalog:write');

  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message, field: String(issue?.path?.[1] ?? issue?.path?.[0] ?? '') };
  }
  const data = parsed.data;

  const categories = await collections.categories();
  const category = toEntity(await categories.findOne({ _id: data.categoryId }));
  if (!category) return { ok: false, error: 'Category not found.' };

  const patch = {
    name: data.name,
    description: data.description || category.description,
    imageUrl: data.imageUrl || category.imageUrl,
    bannerUrl: data.bannerUrl || null,
    featured: data.featured,
    isActive: data.isActive,
    updatedAt: new Date().toISOString(),
  };

  await categories.updateOne({ _id: data.categoryId }, { $set: patch });

  // The mega menu, the footer and every breadcrumb read the tree.
  invalidate([tags.taxonomy, tags.category(category.slug)]);

  await audit.record({
    actor,
    action: 'category.update',
    entityType: 'category',
    entityId: category.id,
    entityLabel: data.name,
    changes: audit.diff(category, patch, ['name', 'imageUrl', 'isActive', 'featured']),
    severity: 'INFO',
  });

  revalidatePath('/admin/categories');
  revalidatePath(`/category/${category.slug}`);
  return { ok: true };
}
