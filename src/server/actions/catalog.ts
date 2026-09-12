'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import type { MediaRole } from '@/domain/types';
import { quickListingSchema, type Blocker } from '@/lib/validation/product';

import { hasPermission, isStaffRole } from '../auth/rbac';
import { requireUser } from '../auth/session';
import { collections, toEntity } from '../db/collections';
import { mediaStore } from '../media/store';
import * as audit from '../services/audit';
import { attachMedia, publishListing, removeMedia, startListing } from '../services/authoring';
import {
  createBrandRecord,
  createCategoryRecord,
  type Author,
} from '../services/catalog-authoring';
import {
  decideBrand,
  decideCategory,
  decideProduct,
  type ItemDecision,
  type ProductDecision,
} from '../services/catalog-review';
import { notifyQuietly } from '../services/notifications';

/**
 * Catalogue authoring, for whoever is doing it.
 *
 * A seller listing their own stock and a catalogue manager listing it for them
 * are the same work, so they are the same actions. The difference is one line:
 * WHO the listing belongs to.
 *
 *   a seller          their own store, always, from the session
 *   staff             the store they picked, which they may only do with
 *                     `catalog:write` AND a staff role
 *
 * That second condition is not redundant. Sellers hold `catalog:write` too --
 * it is what lets them write their own listings -- so the permission alone
 * would let any seller pass another seller's id and author into their store.
 */

export interface CatalogResult {
  ok: boolean;
  error?: string;
  /** The field an error belongs to, so a form can show it under that input. */
  field?: string;
  productId?: string;
  brandId?: string;
  categoryId?: string;
  /** What was just attached, so a form can show it without a round trip. */
  media?: Array<{ id: string; url: string; kind: 'IMAGE' | 'VIDEO'; role: MediaRole }>;
  /** What still stands between a listing and the shop. */
  blockers?: Blocker[];
}

/**
 * Who this listing belongs to.
 *
 * `sellerId` is a request from staff and a no-op for everyone else: a seller's
 * own store id always comes from their session, never from the argument.
 */
async function authorFor(sellerId?: string): Promise<Authoring | { error: string }> {
  const user = await requireUser();

  const staff = user.roles.some(isStaffRole) && hasPermission(user.permissions, 'catalog:write');
  if (staff && sellerId) return { sellerId, userId: user.id, user };

  if (user.sellerId) return { sellerId: user.sellerId, userId: user.id, user };
  if (staff) return { error: 'Choose which store this belongs to.' };

  return { error: 'Only a seller can add products.' };
}

/** An author, plus the session user behind them, for the audit trail. */
interface Authoring extends Author {
  user: Staff;
}

function isError(author: Authoring | { error: string }): author is { error: string } {
  return 'error' in author;
}

/** The store a listing action may touch, or an explanation. */
async function storeFor(sellerId?: string): Promise<{ sellerId: string } | { error: string }> {
  const author = await authorFor(sellerId);
  if (isError(author)) return author;
  if (!author.sellerId) return { error: 'Choose which store this belongs to.' };
  return { sellerId: author.sellerId };
}

function refresh(productId?: string): void {
  revalidatePath('/seller/products');
  revalidatePath('/admin/products');
  revalidatePath('/admin/catalogue');
  if (productId) revalidatePath(`/seller/products/${productId}`);
}

/* ------------------------------------------------------------- listings */

/**
 * Claim a draft for the form to upload against.
 *
 * Photographs have to belong to something before they can be stored against
 * it, and the short form asks for them in the same sitting as the name.
 */
export async function startQuickListing(input?: { sellerId?: string }): Promise<CatalogResult> {
  const store = await storeFor(input?.sellerId);
  if ('error' in store) return { ok: false, error: store.error };

  const started = await startListing(store.sellerId);
  if (!started.ok) return { ok: false, error: started.error };

  return { ok: true, productId: started.productId };
}

export async function publishQuickListing(input: {
  productId: string;
  sellerId?: string;
  listing: unknown;
}): Promise<CatalogResult> {
  const store = await storeFor(input.sellerId);
  if ('error' in store) return { ok: false, error: store.error };

  const parsed = quickListingSchema.safeParse(input.listing);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return {
      ok: false,
      error: issue?.message ?? 'Check the highlighted fields.',
      field: issue?.path?.[0] ? String(issue.path[0]) : undefined,
    };
  }

  const result = await publishListing(store.sellerId, input.productId, parsed.data);
  if (!result.ok) return { ok: false, error: result.error, blockers: result.blockers };

  refresh(input.productId);
  return { ok: true, productId: input.productId };
}

/* ---------------------------------------------------------------- media */

const ROLES: MediaRole[] = ['GALLERY', 'SHOWCASE', 'REEL'];

/**
 * Attach a file the BROWSER already uploaded.
 *
 * Large files go straight to storage through the upload route, so nothing here
 * has seen the bytes -- `verifyUploaded` reads the first kilobytes back and
 * applies the same magic-number test the server-side path applies, before the
 * URL is written against a product. Skipping that would let a signed permit be
 * used to hang arbitrary content off a listing.
 *
 * The ROLE is the caller's to state, because a video's own bytes do not say
 * whether it is the landscape product video or a vertical reel and the form
 * has a separate slot for each. A role is a placement, not a privilege, so
 * taking it from the client is safe; the dimensions it sends are used only to
 * reserve the right space.
 */
export async function attachQuickMedia(input: {
  productId: string;
  sellerId?: string;
  url: string;
  role: MediaRole;
  width?: number | null;
  height?: number | null;
}): Promise<CatalogResult> {
  const store = await storeFor(input.sellerId);
  if ('error' in store) return { ok: false, error: store.error };
  if (!ROLES.includes(input.role)) return { ok: false, error: 'Unknown media slot.' };

  const products = await collections.products();
  const owns = await products.countDocuments({ _id: input.productId, sellerId: store.sellerId });
  if (owns === 0) return { ok: false, error: 'Product not found.' };

  const { verifyUploaded } = await import('../media/verify');
  const verified = await verifyUploaded(input.url);
  if (!verified.ok) return { ok: false, error: verified.error };

  const shape = assumedShape(input.role);
  const attached = await attachMedia(store.sellerId, input.productId, [
    {
      url: input.url,
      contentType: verified.contentType,
      /*
       * A JPEG or a PNG measures itself from its header; an MP4 does not, and
       * nothing here decodes video. The slot the file went into is the better
       * answer anyway -- a reel is 9:16 and a product video is 16:9 -- and it
       * is what the page reserves space from.
       */
      width: verified.width ?? input.width ?? shape.width,
      height: verified.height ?? input.height ?? shape.height,
      role: input.role,
    },
  ]);
  if (!attached.ok) return { ok: false, error: attached.error };

  refresh(input.productId);
  return { ok: true, productId: input.productId, media: summarise(attached.added) };
}

/** The aspect a slot implies, for video the server cannot measure. */
function assumedShape(role: MediaRole): { width: number; height: number } {
  if (role === 'REEL') return { width: 1080, height: 1920 };
  if (role === 'SHOWCASE') return { width: 1920, height: 1080 };
  return { width: 900, height: 1200 };
}

function summarise(added?: Array<{ id: string; url: string; kind: 'IMAGE' | 'VIDEO'; role?: MediaRole }>) {
  return (added ?? []).map((asset) => ({
    id: asset.id,
    url: asset.url,
    kind: asset.kind,
    role: asset.role ?? 'GALLERY',
  }));
}

/** The in-process upload path, for hosts with no ImageKit configured. */
export async function uploadQuickMedia(formData: FormData): Promise<CatalogResult> {
  const sellerId = String(formData.get('sellerId') ?? '') || undefined;
  const store = await storeFor(sellerId);
  if ('error' in store) return { ok: false, error: store.error };

  const productId = String(formData.get('productId') ?? '');
  if (!productId) return { ok: false, error: 'Start the listing before adding files.' };

  const role = String(formData.get('role') ?? 'GALLERY') as MediaRole;
  if (!ROLES.includes(role)) return { ok: false, error: 'Unknown media slot.' };

  const products = await collections.products();
  const owns = await products.countDocuments({ _id: productId, sellerId: store.sellerId });
  if (owns === 0) return { ok: false, error: 'Product not found.' };

  const files = formData.getAll('files').filter((entry): entry is File => entry instanceof File);
  if (files.length === 0) return { ok: false, error: 'Choose at least one file.' };

  const media = mediaStore();
  const stored: Array<{ url: string; contentType: string; width: number | null; height: number | null }> = [];

  for (const file of files) {
    const result = await media.put(file, { scope: productId });
    if (!result.ok) {
      // Clean up anything already written: a half-successful upload leaves
      // orphaned bytes that nothing will ever reference.
      for (const asset of stored) await media.remove(asset.url.split('/').pop() ?? '');
      return { ok: false, error: `${file.name}: ${result.error}` };
    }
    stored.push(result.media);
  }

  const attached = await attachMedia(
    store.sellerId,
    productId,
    stored.map((asset) => ({ ...asset, role })),
  );
  if (!attached.ok) {
    for (const asset of stored) await media.remove(asset.url.split('/').pop() ?? '');
    return { ok: false, error: attached.error };
  }

  refresh(productId);
  return { ok: true, productId, media: summarise(attached.added) };
}

export async function removeQuickMedia(input: {
  productId: string;
  sellerId?: string;
  mediaId: string;
}): Promise<CatalogResult> {
  const store = await storeFor(input.sellerId);
  if ('error' in store) return { ok: false, error: store.error };

  const result = await removeMedia(store.sellerId, input.productId, input.mediaId);
  if (!result.ok) return { ok: false, error: result.error };

  refresh(input.productId);
  return { ok: true, productId: input.productId };
}

/* ------------------------------------------------------ brands and shelves */

const brandSchema = z.object({
  name: z.string().trim().min(2, 'Give the brand a name').max(80),
  description: z.string().trim().max(400).optional(),
  logoUrl: z.string().trim().max(500).optional(),
  sellerId: z.string().optional(),
});

/**
 * Add a brand, live immediately.
 *
 * A seller who cannot name their own label cannot list anything, and waiting
 * for someone at the platform to add it is what used to stall a store on its
 * first day. Staff see it afterwards in the catalogue inbox.
 */
export async function addBrand(input: z.input<typeof brandSchema>): Promise<CatalogResult> {
  const parsed = brandSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message, field: String(issue?.path?.[0] ?? 'name') };
  }

  const author = await authorFor(parsed.data.sellerId);
  if (isError(author)) return { ok: false, error: author.error };

  const created = await createBrandRecord(
    {
      name: parsed.data.name,
      description: parsed.data.description,
      logoUrl: parsed.data.logoUrl,
    },
    author,
  );
  if (!created.ok || !created.value) {
    return { ok: false, error: created.error, field: created.field };
  }

  await audit.record({
    actor: author.user,
    action: 'brand.create',
    entityType: 'brand',
    entityId: created.value.id,
    entityLabel: created.value.name,
    severity: 'NOTICE',
  });

  revalidatePath('/admin/brands');
  revalidatePath('/admin/catalogue');
  return { ok: true, brandId: created.value.id };
}

const categorySchema = z.object({
  parentId: z.string().min(1, 'Choose where it sits'),
  name: z.string().trim().min(2, 'Give it a name').max(60),
  description: z.string().trim().max(300).optional(),
  sellerId: z.string().optional(),
});

/** Add a category under an existing one. Live immediately, reviewed later. */
export async function addCategory(input: z.input<typeof categorySchema>): Promise<CatalogResult> {
  const parsed = categorySchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue?.message, field: String(issue?.path?.[0] ?? 'name') };
  }

  const author = await authorFor(parsed.data.sellerId);
  if (isError(author)) return { ok: false, error: author.error };

  const created = await createCategoryRecord(
    {
      parentId: parsed.data.parentId,
      name: parsed.data.name,
      description: parsed.data.description,
    },
    author,
  );
  if (!created.ok || !created.value) {
    return { ok: false, error: created.error, field: created.field };
  }

  revalidatePath('/admin/categories');
  revalidatePath('/admin/catalogue');
  return { ok: true, categoryId: created.value.id };
}

/* ------------------------------------------------------------ the inbox */

const productDecisionSchema = z.object({
  productId: z.string().min(1),
  decision: z.enum(['KEEP', 'UNPUBLISH', 'ARCHIVE']),
  reason: z.string().max(400).optional(),
});

/**
 * Staff decide on something a seller published.
 *
 * The listing is already in the shop, so this is not an approval: KEEP simply
 * records that a human looked, which is what takes it out of the inbox.
 * Taking one down tells the seller why, because a listing that vanishes with
 * no message becomes a support ticket.
 */
export async function decideNewProduct(input: {
  productId: string;
  decision: ProductDecision;
  reason?: string;
}): Promise<CatalogResult> {
  const actor = await requireStaff('catalog:approve');
  if ('error' in actor) return { ok: false, error: actor.error };

  const parsed = productDecisionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'That is not a valid decision.' };

  if (parsed.data.decision !== 'KEEP' && (parsed.data.reason ?? '').trim().length < 8) {
    // The seller reads this. "Taken down" with no reason is unactionable.
    return { ok: false, field: 'reason', error: 'Give the seller a reason they can act on.' };
  }

  const result = await decideProduct(
    actor.user.id,
    parsed.data.productId,
    parsed.data.decision,
    parsed.data.reason,
  );
  if (!result.ok) return { ok: false, error: result.error };

  await audit.record({
    actor: actor.user,
    action: parsed.data.decision === 'KEEP' ? 'catalog.approve' : 'catalog.reject',
    entityType: 'product',
    entityId: parsed.data.productId,
    entityLabel: result.notice?.body ?? parsed.data.productId,
    note: parsed.data.reason ?? null,
    severity: parsed.data.decision === 'KEEP' ? 'INFO' : 'NOTICE',
  });

  await tellSeller(result.notice);
  refresh(parsed.data.productId);
  return { ok: true };
}

export async function decideNewBrand(input: {
  brandId: string;
  decision: ItemDecision;
}): Promise<CatalogResult> {
  const actor = await requireStaff('catalog:write');
  if ('error' in actor) return { ok: false, error: actor.error };

  const result = await decideBrand(actor.user.id, input.brandId, input.decision);
  if (!result.ok) return { ok: false, error: result.error };

  await tellSeller(result.notice);
  revalidatePath('/admin/catalogue');
  revalidatePath('/admin/brands');
  return { ok: true };
}

export async function decideNewCategory(input: {
  categoryId: string;
  decision: ItemDecision;
}): Promise<CatalogResult> {
  const actor = await requireStaff('catalog:write');
  if ('error' in actor) return { ok: false, error: actor.error };

  const result = await decideCategory(actor.user.id, input.categoryId, input.decision);
  if (!result.ok) return { ok: false, error: result.error };

  await tellSeller(result.notice);
  revalidatePath('/admin/catalogue');
  revalidatePath('/admin/categories');
  return { ok: true };
}

/* --------------------------------------------------------------- helpers */

type Staff = Awaited<ReturnType<typeof requireUser>>;

async function requireStaff(
  permission: 'catalog:write' | 'catalog:approve',
): Promise<{ user: Staff } | { error: string }> {
  const user = await requireUser();
  if (!user.roles.some(isStaffRole) || !hasPermission(user.permissions, permission)) {
    return { error: 'You do not have access to the catalogue queue.' };
  }
  return { user };
}

/** The seller OWNER receives this, not the store record. */
async function tellSeller(notice?: { sellerId: string; title: string; body: string }) {
  if (!notice) return;

  const sellers = await collections.sellers();
  const seller = toEntity(await sellers.findOne({ _id: notice.sellerId }));
  if (!seller) return;

  notifyQuietly({
    userId: seller.ownerUserId,
    category: 'CATALOG',
    title: notice.title,
    body: notice.body,
    href: '/seller/products',
  });
}
