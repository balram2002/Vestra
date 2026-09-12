import 'server-only';

import type { Brand, Category, SizeSystem } from '@/domain/types';
import { entityId } from '@/lib/ids';
import { slugify } from '@/lib/slug';

import { collections, toDoc, toEntity } from '../db/collections';
import { MEDIA_VERSION } from '../seed/media';
import { invalidate } from './cache-invalidation';
import { tags } from './cache-tags';

/**
 * Brands and categories, created by whoever needs them.
 *
 * A seller who cannot name their own label cannot list anything, and waiting
 * for someone at the platform to add it is the step that used to stall a store
 * on its first day. So sellers create both, they go live immediately, and staff
 * see them afterwards in the catalogue inbox.
 *
 * This is the ONE implementation. The admin console calls it too, so a brand
 * made by staff and a brand made by a seller are the same record with the same
 * slug rules -- the only difference is who is recorded as its author and
 * whether it arrives already reviewed.
 *
 * WHY A SELLER'S CODE CLASH IS NOT AN ERROR
 *
 * A brand code goes into every SKU made under it, so it must be unique. Staff
 * adding a brand are told to pick another; a seller has no idea what a code is
 * and no way to choose a better one, so theirs is nudged until it is free. A
 * name clash IS still an error, because two brands with one name is a
 * catalogue problem no suffix can fix.
 */

export interface Author {
  /** The store this is created for, or null when staff act for the platform. */
  sellerId: string | null;
  userId: string;
}

export interface CreateResult<T> {
  ok: boolean;
  error?: string;
  /** The field an error belongs to, so a form can show it under that input. */
  field?: string;
  value?: T;
}

function fail<T>(field: string, error: string): CreateResult<T> {
  return { ok: false, field, error };
}

/**
 * Staff-made records arrive reviewed; a seller's do not.
 *
 * This is what fills the catalogue inbox: `reviewedAt: null` is the whole
 * definition of "nobody has looked at this yet".
 */
function reviewState(author: Author, now: string) {
  return {
    createdBySellerId: author.sellerId,
    reviewedAt: author.sellerId ? null : now,
  };
}

/* ------------------------------------------------------------------ brands */

export interface BrandDraft {
  name: string;
  code?: string;
  description?: string;
  logoUrl?: string;
  originCountry?: string;
  foundedYear?: number | null;
  isPremium?: boolean;
}

export async function createBrandRecord(
  input: BrandDraft,
  author: Author,
): Promise<CreateResult<Brand>> {
  const name = input.name.trim();
  const slug = slugify(name);
  if (!slug) return fail('name', 'Use letters or digits in the name.');

  if (input.logoUrl && !/^https:\/\/\S+$/.test(input.logoUrl)) {
    return fail('logoUrl', 'Use an https:// link to the logo, or leave it blank.');
  }

  const brands = await collections.brands();
  if (await brands.findOne({ $or: [{ slug }, { slugHistory: slug }] })) {
    return fail('name', 'A brand with that name already exists. Pick it from the list instead.');
  }

  const code = await freeCode(input.code, name, async (candidate) =>
    Boolean(await brands.findOne({ code: candidate })),
  );
  if (!code) return fail('code', 'Codes are 2 to 6 letters or digits.');

  const now = new Date().toISOString();
  const brand: Brand = {
    id: entityId('brd'),
    slug,
    slugHistory: [],
    name,
    code,
    // Without a logo the brand gets a monogram drawn by the site itself, rather
    // than a stock photograph that would misrepresent it.
    logoUrl: input.logoUrl || `/api/media/t/brand/mulberry/${slug}-r${MEDIA_VERSION}.svg`,
    bannerUrl: null,
    description: input.description?.trim() || `${name} on VestraWAB.`,
    originCountry: input.originCountry?.trim() || 'India',
    foundedYear: input.foundedYear ?? null,
    isPremium: input.isPremium ?? false,
    isActive: true,
    productCount: 0,
    averageRating: 0,
    categoryIds: [],
    metaTitle: `${name} — Shop ${name} Online | VestraWAB`,
    metaDescription: input.description?.trim() || null,
    createdAt: now,
    updatedAt: now,
    ...reviewState(author, now),
  };

  await brands.insertOne(toDoc(brand));
  invalidate([tags.brandList, tags.brand(slug)]);

  return { ok: true, value: brand };
}

/**
 * A code nobody else is using.
 *
 * Tries what was asked for, then the name's own letters, then the same with a
 * digit appended. Returns null only when there is nothing usable to build from.
 */
async function freeCode(
  requested: string | undefined,
  name: string,
  taken: (candidate: string) => Promise<boolean>,
): Promise<string | null> {
  const base = (requested?.trim() || name.replace(/[^A-Za-z0-9]/g, '').slice(0, 4)).toUpperCase();
  if (!/^[A-Z0-9]{2,6}$/.test(base)) return null;

  if (!(await taken(base))) return base;

  const stem = base.slice(0, 5);
  for (let suffix = 2; suffix < 10; suffix += 1) {
    const candidate = `${stem}${suffix}`;
    if (!(await taken(candidate))) return candidate;
  }
  // Nine collisions on one stem is vanishingly unlikely; a random tail ends it.
  return `${base.slice(0, 3)}${Math.floor(100 + Math.random() * 899)}`;
}

/* -------------------------------------------------------------- categories */

export interface CategoryDraft {
  parentId: string;
  name: string;
  description?: string;
  /** null inherits the parent's slab. */
  taxRatePercent?: number | null;
  /** null inherits the parent's policy. */
  returnable?: boolean | null;
  featured?: boolean;
}

/**
 * Add a category under an existing one.
 *
 * Departments (Men, Women, Kids) are structural and are NOT created here: each
 * carries an attribute family that drives the facets and the listing form, and
 * a new one is a catalogue project rather than a form. A child inherits its
 * family, size system and imagery from its parent, which is what makes it safe
 * for a seller to add one: they are naming a shelf, not inventing a taxonomy.
 */
export async function createCategoryRecord(
  input: CategoryDraft,
  author: Author,
): Promise<CreateResult<Category>> {
  const name = input.name.trim();
  const categories = await collections.categories();
  const parent = toEntity(await categories.findOne({ _id: input.parentId }));
  if (!parent) return fail('parentId', 'That parent category no longer exists.');
  if (parent.depth >= 2) {
    return fail('parentId', 'The tree goes three levels deep at most. Pick a higher parent.');
  }

  const base = slugify(name);
  if (!base) return fail('name', 'Use letters or digits in the name.');

  // Slugs are global, so Kurtas under Men and under Women cannot both own
  // /category/kurtas. The second one is prefixed with its parent.
  const taken = async (slug: string) =>
    Boolean(await categories.findOne({ $or: [{ slug }, { slugHistory: slug }] }));
  let slug = base;
  if (await taken(slug)) {
    slug = `${parent.slug}-${base}`.slice(0, 80);
    if (await taken(slug)) return fail('name', 'A category with that name already exists here.');
  }

  const [last] = await categories
    .find({ parentId: parent.id })
    .sort({ position: -1 })
    .limit(1)
    .toArray();

  const now = new Date().toISOString();
  const category: Category = {
    id: entityId('cat'),
    slug,
    slugHistory: [],
    name,
    path: [...parent.path, slug],
    parentId: parent.id,
    depth: parent.depth + 1,
    attributeFamily: parent.attributeFamily,
    gender: parent.gender,
    sizeSystem: parent.sizeSystem,
    sizeChart: null,
    description:
      input.description?.trim() || `${name} from independent labels, delivered across India.`,
    seoIntro: null,
    imageUrl: parent.imageUrl,
    bannerUrl: null,
    iconKey: parent.iconKey,
    position: (last?.position ?? 0) + 1,
    isActive: true,
    featured: input.featured ?? false,
    productCount: 0,
    taxRatePercent: input.taxRatePercent ?? parent.taxRatePercent,
    returnable: input.returnable ?? parent.returnable,
    metaTitle: `${name} — Buy ${name} Online | VestraWAB`,
    metaDescription: input.description?.trim() || null,
    createdAt: now,
    updatedAt: now,
    ...reviewState(author, now),
  };

  await categories.insertOne(toDoc(category));
  invalidate([tags.taxonomy, tags.category(parent.slug)]);

  return { ok: true, value: category };
}

/* ----------------------------------------------------------- the pickers */

export interface ListingOptions {
  brands: Array<{ id: string; name: string }>;
  /** Leaves only: a department is a navigation node, not a shelf for stock. */
  categories: Array<{ id: string; name: string; sizeSystem: SizeSystem }>;
  /** Where a new category may be hung. Everything that is not a leaf. */
  parents: Array<{ id: string; name: string }>;
}

/**
 * Everything the short form needs to offer.
 *
 * Not filtered by what a store is "approved" for. Approvals were a gate on a
 * review queue that no longer exists, and a seller who can create a category
 * outright cannot sensibly be refused the one next to it.
 */
export async function listingOptions(): Promise<ListingOptions> {
  const [brandCol, categoryCol] = await Promise.all([
    collections.brands(),
    collections.categories(),
  ]);

  const [brands, categories] = await Promise.all([
    brandCol.find({ isActive: true }).sort({ name: 1 }).toArray(),
    categoryCol.find({ isActive: true }).sort({ path: 1 }).toArray(),
  ]);

  const isParent = new Set(categories.map((row) => row.parentId).filter(Boolean) as string[]);
  // Names, not slugs: "Women > Ethnic Wear > Kurtas", never "women/ethnic-wear".
  const nameOfSlug = new Map(categories.map((row) => [row.slug, row.name]));
  const trail = (row: (typeof categories)[number]) =>
    row.path.map((slug) => nameOfSlug.get(slug) ?? slug).join(' › ');

  return {
    brands: brands.map((row) => ({ id: row._id, name: row.name })),
    categories: categories
      .filter((row) => !isParent.has(row._id))
      .map((row) => ({ id: row._id, name: trail(row), sizeSystem: row.sizeSystem })),
    parents: categories
      .filter((row) => isParent.has(row._id) && row.depth < 2)
      .map((row) => ({ id: row._id, name: trail(row) })),
  };
}
