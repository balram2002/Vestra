'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { ADDABLE_SECTION_KINDS } from '@/domain/sections';
import { planHomeReset } from '@/domain/section-reset';
import type { HomeSection, HomeSectionKind } from '@/domain/types';
import { entityId } from '@/lib/ids';

import { requirePermission } from '../auth/session';
import { collections, toDoc, toEntities, toEntity } from '../db/collections';
import * as audit from '../services/audit';
import { invalidate } from '../services/cache-invalidation';
import { tags } from '../services/cache-tags';
import { categoryPageDefaults } from '../services/category-page';

export async function initializeCategoryPage(): Promise<SectionResult> {
  const actor = await requirePermission('cms:write');
  const col = await collections.homeSections();
  for (const section of await categoryPageDefaults()) {
    await col.updateOne({ _id: section.id }, { $setOnInsert: toDoc({ ...section, updatedByUserId: actor.id }) }, { upsert: true });
  }
  invalidate([tags.content]);
  revalidatePath('/admin/categories-page');
  return { ok: true };
}

/**
 * Composing a page.
 *
 * A page is a list of sections in an order, and every one of these actions is
 * about that list: add one, change one, move one, remove one. The storefront
 * renders whatever the list says, so this is the whole of "what is on the
 * homepage" -- there is no arrangement hiding in the code.
 *
 * POSITION IS NORMALISED ON EVERY WRITE. Sections are stored with a position
 * and rendered in that order, and the cheap implementation -- swap two numbers
 * -- rots the moment anything is inserted or deleted, leaving gaps and ties
 * whose order is then decided by the database. Rewriting 0..n-1 after each
 * change keeps the list an actual list.
 */

export interface SectionResult {
  ok: boolean;
  error?: string;
  sectionId?: string;
}

/** Kinds an editor may add. The hero is excluded: a page has one, and it exists. */
const ADDABLE_KINDS: HomeSectionKind[] = [...ADDABLE_SECTION_KINDS];

const KIND_DEFAULTS: Partial<Record<HomeSectionKind, Partial<HomeSection>>> = {
  PRODUCT_RAIL: {
    title: 'New in',
    subtitle: null,
    config: { source: 'NEW_ARRIVALS', limit: 12, layout: 'CAROUSEL' },
  },
  CATEGORY_STRIP: { title: 'Shop by category', config: { limit: 12 } },
  BANNER_GRID: { title: null, config: {} },
  BRAND_STRIP: { title: 'Brands to know', config: { limit: 12 } },
  SELLER_SPOTLIGHT: { title: 'Stores worth following', config: { limit: 4 } },
  EDITORIAL: {
    title: 'A headline',
    config: { body: '', layout: 'SPLIT', theme: 'light' },
  },
  DEAL_COUNTDOWN: {
    title: 'Ends soon',
    subtitle: 'Set an end date below and the countdown appears beside the heading.',
    config: { source: 'DEALS', limit: 12, layout: 'CAROUSEL' },
  },
  REELS_STRIP: { title: 'Watch and shop', config: { limit: 10 } },
  TESTIMONIALS: { title: 'What shoppers say', config: { limit: 6 } },
  VALUE_PROPS: { title: null, config: {} },
};

const configSchema = z.object({
  layoutDesktop: z.enum(['DEFAULT', 'FEATURED', 'MOSAIC']).optional(),
  layoutMobile: z.enum(['DEFAULT', 'FEATURED', 'MOSAIC']).optional(),
  categoryMode: z.enum(['AUTO', 'MANUAL']).optional(),
  source: z
    .enum(['MANUAL', 'NEW_ARRIVALS', 'BESTSELLERS', 'TRENDING', 'DEALS', 'RECOMMENDED', 'CATEGORY', 'BRAND'])
    .optional(),
  productIds: z.array(z.string()).max(48).optional(),
  categoryIds: z.array(z.string()).max(48).optional(),
  brandIds: z.array(z.string()).max(48).optional(),
  sellerIds: z.array(z.string()).max(48).optional(),
  bannerIds: z.array(z.string()).max(24).optional(),
  limit: z.number().int().min(1).max(48).optional(),
  body: z.string().max(2000).optional(),
  imageUrl: z.string().max(600).optional(),
  layout: z.enum(['GRID_2', 'GRID_3', 'GRID_4', 'CAROUSEL', 'SPLIT', 'BANNER']).optional(),
  theme: z.enum(['light', 'dark', 'accent']).optional(),
});

const patchSchema = z.object({
  title: z.string().trim().max(80).nullable().optional(),
  subtitle: z.string().trim().max(200).nullable().optional(),
  href: z.string().trim().max(300).refine((value) => !value || /^\/(?![\/\\])[^\\]*$/.test(value) || /^https:\/\//i.test(value), 'Use a local path or an HTTPS link').nullable().optional(),
  ctaLabel: z.string().trim().max(40).nullable().optional(),
  isActive: z.boolean().optional(),
  visibleOn: z.enum(['ALL', 'DESKTOP', 'MOBILE']).optional(),
  startsAt: z.string().max(40).refine((value) => Number.isFinite(Date.parse(value)), 'Choose a valid start date').nullable().optional(),
  endsAt: z.string().max(40).refine((value) => Number.isFinite(Date.parse(value)), 'Choose a valid end date').nullable().optional(),
  config: configSchema.optional(),
});

export async function createSection(input: {
  kind: HomeSectionKind;
  page?: string;
}): Promise<SectionResult> {
  const actor = await requirePermission('cms:write');

  if (!ADDABLE_KINDS.includes(input.kind)) {
    return { ok: false, error: 'That section cannot be added here.' };
  }

  const page = input.page?.trim() || 'home';
  const sections = await collections.homeSections();
  const existing = await sectionsFor(page);

  const defaults = KIND_DEFAULTS[input.kind] ?? {};
  const now = new Date().toISOString();

  const section: HomeSection = {
    id: entityId('sec'),
    kind: input.kind,
    title: defaults.title ?? null,
    subtitle: defaults.subtitle ?? null,
    href: null,
    ctaLabel: null,
    position: existing.length,
    // A new section arrives HIDDEN. Anything else would put a half-configured
    // rail in front of shoppers the instant it was created.
    isActive: false,
    startsAt: null,
    endsAt: null,
    visibleOn: 'ALL',
    config: defaults.config ?? {},
    updatedAt: now,
    updatedByUserId: actor.id,
    page,
  };

  await sections.insertOne(toDoc(section));
  await after(actor, 'content.section.create', section, page);

  return { ok: true, sectionId: section.id };
}

export async function updateSection(input: {
  sectionId: string;
  patch: unknown;
}): Promise<SectionResult> {
  const actor = await requirePermission('cms:write');

  const parsed = patchSchema.safeParse(input.patch);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the highlighted fields.' };
  }

  const sections = await collections.homeSections();
  const section = toEntity(await sections.findOne({ _id: input.sectionId }));
  if (!section) return { ok: false, error: 'Section not found.' };

  const startsAt = parsed.data.startsAt === undefined ? section.startsAt : parsed.data.startsAt;
  const endsAt = parsed.data.endsAt === undefined ? section.endsAt : parsed.data.endsAt;
  if (startsAt && endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) return { ok: false, error: 'The end must be after the start.' };

  const { config, ...rest } = parsed.data;
  await sections.updateOne(
    { _id: input.sectionId },
    {
      $set: {
        ...rest,
        // The config is replaced whole: the editor sends every field it owns,
        // and merging would make "clear the hand-picked list" inexpressible.
        ...(config ? { config } : {}),
        updatedAt: new Date().toISOString(),
        updatedByUserId: actor.id,
      },
    },
  );

  await after(actor, 'content.section.update', section, section.page ?? 'home');
  return { ok: true, sectionId: section.id };
}

export async function deleteSection(input: { sectionId: string }): Promise<SectionResult> {
  const actor = await requirePermission('cms:write');

  const sections = await collections.homeSections();
  const section = toEntity(await sections.findOne({ _id: input.sectionId }));
  if (!section) return { ok: false, error: 'Section not found.' };

  await sections.deleteOne({ _id: input.sectionId });
  await renumber(section.page ?? 'home');
  await after(actor, 'content.section.delete', section, section.page ?? 'home');

  return { ok: true };
}

export async function moveSection(input: {
  sectionId: string;
  direction: 'UP' | 'DOWN';
}): Promise<SectionResult> {
  const actor = await requirePermission('cms:write');

  const sections = await collections.homeSections();
  const section = toEntity(await sections.findOne({ _id: input.sectionId }));
  if (!section) return { ok: false, error: 'Section not found.' };

  const page = section.page ?? 'home';
  const ordered = await sectionsFor(page);
  const from = ordered.findIndex((entry) => entry.id === section.id);
  const to = input.direction === 'UP' ? from - 1 : from + 1;
  if (from < 0 || to < 0 || to >= ordered.length) return { ok: true };

  const reordered = [...ordered];
  const [moved] = reordered.splice(from, 1);
  reordered.splice(to, 0, moved);

  await Promise.all(
    reordered.map((entry, position) =>
      sections.updateOne({ _id: entry.id }, { $set: { position } }),
    ),
  );

  await after(actor, 'content.section.move', section, page);
  return { ok: true };
}

/* --------------------------------------------------------------- pickers */

export interface ItemOption {
  id: string;
  label: string;
  hint?: string;
  imageUrl?: string | null;
}

/**
 * What an editor can hand-pick, searched by name.
 *
 * One action for five kinds of thing, because the picker is one component: it
 * shows a label, an optional picture, and returns an id. Anything more specific
 * belongs in the section that uses it.
 */
export async function searchSectionItems(input: {
  kind: 'product' | 'category' | 'brand' | 'seller' | 'banner';
  query?: string;
  ids?: string[];
}): Promise<{ ok: boolean; items: ItemOption[] }> {
  await requirePermission('cms:write');

  const query = input.query?.trim() ?? '';
  const ids = input.ids ?? [];
  // A regex anchored nowhere still uses an index prefix for a leading literal,
  // and these lists are small enough that clarity wins over cleverness.
  const like = query ? { $regex: escapeRegex(query), $options: 'i' } : undefined;
  const filter = (field: string) =>
    ids.length > 0 ? { _id: { $in: ids } } : like ? { [field]: like } : {};

  switch (input.kind) {
    case 'product': {
      const products = await collections.products();
      const rows = await products
        .find({ ...filter('title'), status: 'PUBLISHED' })
        .limit(24)
        .toArray();
      return {
        ok: true,
        items: toEntities(rows).map((row) => ({
          id: row.id,
          label: row.title,
          hint: row.categoryPath.join(' › '),
          imageUrl: row.media[0]?.url ?? null,
        })),
      };
    }
    case 'category': {
      const categories = await collections.categories();
      const rows = await categories.find(filter('name')).limit(24).toArray();
      return {
        ok: true,
        items: toEntities(rows).map((row) => ({
          id: row.id,
          label: row.path.join(' › '),
          hint: row.isActive ? undefined : 'Hidden',
          imageUrl: row.imageUrl,
        })),
      };
    }
    case 'brand': {
      const brands = await collections.brands();
      const rows = await brands.find(filter('name')).limit(24).toArray();
      return {
        ok: true,
        items: toEntities(rows).map((row) => ({
          id: row.id,
          label: row.name,
          hint: `${row.productCount} products`,
          imageUrl: row.logoUrl,
        })),
      };
    }
    case 'seller': {
      const sellers = await collections.sellers();
      const rows = await sellers.find(filter('displayName')).limit(24).toArray();
      return {
        ok: true,
        items: toEntities(rows).map((row) => ({
          id: row.id,
          label: row.displayName,
          hint: `${row.metrics?.liveProductCount ?? 0} live products`,
          imageUrl: row.logoUrl,
        })),
      };
    }
    case 'banner': {
      const banners = await collections.banners();
      const rows = await banners.find(filter('name')).limit(24).toArray();
      return {
        ok: true,
        items: toEntities(rows).map((row) => ({
          id: row.id,
          label: row.headline ?? row.name,
          hint: row.placement,
          imageUrl: row.imageUrl,
        })),
      };
    }
    default:
      return { ok: true, items: [] };
  }
}

/* --------------------------------------------------------------- helpers */

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function sectionsFor(page: string): Promise<HomeSection[]> {
  const sections = await collections.homeSections();
  const filter =
    page === 'home'
      ? { $or: [{ page }, { page: { $exists: false } }] }
      : { page };

  return toEntities(await sections.find(filter).sort({ position: 1 }).toArray());
}

/** Positions become 0..n-1 again, so the list has no gaps or ties. */
async function renumber(page: string): Promise<void> {
  const sections = await collections.homeSections();
  const ordered = await sectionsFor(page);
  await Promise.all(
    ordered.map((entry, position) =>
      sections.updateOne({ _id: entry.id }, { $set: { position } }),
    ),
  );
}

async function after(
  actor: Awaited<ReturnType<typeof requirePermission>>,
  action: string,
  section: HomeSection,
  page: string,
): Promise<void> {
  invalidate([tags.content]);

  await audit.record({
    actor,
    action,
    entityType: 'homeSection',
    entityId: section.id,
    entityLabel: section.title ?? section.kind,
    severity: 'INFO',
  });

  revalidatePath('/admin/cms');
  revalidatePath(page === 'home' ? '/' : `/${page}`);
}

/* ------------------------------------------------------------------ resets */

interface DefaultSection extends HomeSection {
  defaultKey: string;
}

/**
 * The homepage as it ships.
 *
 * The same generator the reference seed runs on a clean database, so "reset"
 * means exactly the page a new shop starts with -- not a second copy of that
 * layout kept here, free to drift from the first.
 */
async function homeDefaults(): Promise<DefaultSection[]> {
  const { generateHomeSections } = await import('../seed/generate');
  return generateHomeSections(new Date()).map((section) => ({
    ...section,
    defaultKey: 'home:' + section.kind + ':' + section.position,
  }));
}

/** The shipped section a stored one came from, if it came from one. */
function defaultFor(section: HomeSection, defaults: DefaultSection[]): DefaultSection | null {
  if (section.defaultKey) {
    return defaults.find((entry) => entry.defaultKey === section.defaultKey) ?? null;
  }
  return (
    defaults.find(
      (entry) => entry.kind === section.kind && (entry.title ?? null) === (section.title ?? null),
    ) ?? null
  );
}

/**
 * Put one section back.
 *
 * A shipped section goes back to exactly what it shipped as -- "Bestsellers"
 * returns as Bestsellers, however it was renamed. A section somebody added
 * goes back to the defaults a fresh one of its kind is given. Its place on the
 * page and whether it is live are left alone: a reset is about what a section
 * SAYS, and moving or hiding it as a side effect would be a surprise.
 */
export async function resetSection(input: { sectionId: string }): Promise<SectionResult> {
  const actor = await requirePermission('cms:write');

  const sections = await collections.homeSections();
  const section = toEntity(await sections.findOne({ _id: input.sectionId }));
  if (!section) return { ok: false, error: 'Section not found.' };

  const page = section.page ?? 'home';
  const shipped = page === 'home' ? defaultFor(section, await homeDefaults()) : page === 'categories' ? (await categoryPageDefaults()).find((entry) => entry.defaultKey === section.defaultKey) : null;
  const fresh = KIND_DEFAULTS[section.kind] ?? {};

  await sections.updateOne(
    { _id: section.id },
    {
      $set: {
        title: shipped ? shipped.title : (fresh.title ?? null),
        subtitle: shipped ? shipped.subtitle : (fresh.subtitle ?? null),
        href: shipped ? shipped.href : null,
        ctaLabel: shipped ? shipped.ctaLabel : null,
        config: shipped ? shipped.config : (fresh.config ?? {}),
        visibleOn: 'ALL' as const,
        startsAt: null,
        endsAt: null,
        ...(shipped ? { defaultKey: shipped.defaultKey } : {}),
        updatedAt: new Date().toISOString(),
        updatedByUserId: actor.id,
      },
    },
  );

  await after(actor, 'content.section.reset', section, page);
  return { ok: true, sectionId: section.id };
}

/**
 * Put a whole page back.
 *
 * NOTHING IS DELETED. The homepage gets its shipped sections back -- live, in
 * their shipped order, with their shipped settings -- and anything somebody
 * added is HIDDEN and moved to the foot of the list, where it can be brought
 * back with one click. A landing page ships with nothing composed on it, so
 * its reset hides every section and keeps them all.
 *
 * Matching is by the stamped `defaultKey`, then by the shipped title, and a
 * shipped section that cannot be found is recreated. That order is what stops
 * a second reset from adding a second "Bestsellers".
 */
export async function resetPageSections(input: { page: string }): Promise<SectionResult> {
  const actor = await requirePermission('cms:write');

  const page = input.page?.trim() || 'home';
  const sections = await collections.homeSections();
  const current = await sectionsFor(page);
  const now = new Date().toISOString();
  const writes: Array<Promise<unknown>> = [];

  if (page === 'home' || page === 'categories') {
    const defaults = page === 'home' ? await homeDefaults() : await categoryPageDefaults() as DefaultSection[];
    // Which stored section is which shipped one is decided by a pure, tested
    // planner -- see `domain/section-reset` -- and this only applies its answer.
    const plan = planHomeReset(current, defaults);

    for (const { id, entry, position } of plan.restore) {
      writes.push(
        sections.updateOne({ _id: id }, { $set: shippedFields(entry, position, now, actor.id) }),
      );
    }
    for (const { entry, position } of plan.create) {
      writes.push(
        sections.insertOne(
          toDoc({ ...shippedFields(entry, position, now, actor.id), id: entityId('sec') } as HomeSection),
        ),
      );
    }
    for (const { id, position } of plan.hide) {
      writes.push(
        sections.updateOne(
          { _id: id },
          { $set: { isActive: false, position, updatedAt: now, updatedByUserId: actor.id } },
        ),
      );
    }
  } else {
    for (const section of current) {
      writes.push(
        sections.updateOne(
          { _id: section.id },
          { $set: { isActive: false, updatedAt: now, updatedByUserId: actor.id } },
        ),
      );
    }
  }

  await Promise.all(writes);

  await audit.record({
    actor,
    action: 'content.page.reset',
    entityType: 'page',
    entityId: page,
    entityLabel: page === 'home' ? 'Homepage' : page,
    severity: 'NOTICE',
  });

  invalidate([tags.content]);
  revalidatePath('/admin/cms');
  revalidatePath(page === 'home' ? '/' : '/' + page);

  return { ok: true };
}

/** A stored section, set back to exactly what shipped. */
function shippedFields(entry: DefaultSection, position: number, now: string, userId: string) {
  return {
    kind: entry.kind,
    title: entry.title,
    subtitle: entry.subtitle,
    href: entry.href,
    ctaLabel: entry.ctaLabel,
    config: entry.config,
    visibleOn: entry.visibleOn,
    startsAt: null,
    endsAt: null,
    position,
    isActive: true,
    page: entry.page ?? 'home',
    defaultKey: entry.defaultKey,
    updatedAt: now,
    updatedByUserId: userId,
  };
}
