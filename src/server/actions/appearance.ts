'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';

import { CONTENT_ICONS, DEFAULT_SITE_CONTENT, type SiteContent } from '@/domain/site-content';

import { requirePermission } from '../auth/session';
import * as audit from '../services/audit';
import { saveSiteContent } from '../services/site-content';

/**
 * Editing the shop's own words.
 *
 * Every one of these replaces a WHOLE block -- the complete list of
 * announcements, the complete set of footer columns -- because that is how the
 * editor works: rows are added, reordered and deleted on screen and saved
 * together. A per-row action would need its own ordering rules and could not
 * express "delete the last one".
 *
 * `cms:write` throughout. This is the copy on every page of the shop, so it
 * sits with the people who own the homepage rather than with anyone who can
 * edit a product.
 */

export interface AppearanceResult {
  ok: boolean;
  error?: string;
}

const href = z
  .string()
  .trim()
  .max(300)
  .refine((value) => value === '' || value.startsWith('/') || /^https?:\/\//.test(value), {
    message: 'Use a path like /help/returns, or a full https:// address.',
  });

const announcementSchema = z.object({
  id: z.string().min(1).max(60),
  text: z.string().trim().min(1, 'Say something, or remove the line.').max(120),
  href: href.nullable(),
  isActive: z.boolean(),
});

const valuePropSchema = z.object({
  id: z.string().min(1).max(60),
  icon: z.enum(CONTENT_ICONS),
  title: z.string().trim().min(1, 'Give the promise a title.').max(80),
  body: z.string().trim().max(400),
  isActive: z.boolean(),
});

const footerColumnSchema = z.object({
  id: z.string().min(1).max(60),
  title: z.string().trim().min(1, 'Name the column.').max(40),
  links: z
    .array(
      z.object({
        id: z.string().min(1).max(60),
        label: z.string().trim().min(1, 'Give the link a label.').max(60),
        href,
      }),
    )
    .max(20),
});

const footerBadgeSchema = z.object({
  id: z.string().min(1).max(60),
  icon: z.enum(CONTENT_ICONS),
  label: z.string().trim().min(1, 'Give the badge a label.').max(60),
});

const schemas = {
  announcements: z.array(announcementSchema).max(12),
  headerActions: z.object({
    search: z.boolean(),
    reels: z.boolean(),
    wishlist: z.boolean(),
    bag: z.boolean(),
  }),
  visibility: z.object({
    announcements: z.boolean(),
    valueProps: z.boolean(),
    footerBadges: z.boolean(),
    footerColumns: z.boolean(),
  }),
  valueProps: z.array(valuePropSchema).max(6),
  valuePropsTitle: z.string().trim().max(80).nullable(),
  footerColumns: z.array(footerColumnSchema).max(6),
  footerBadges: z.array(footerBadgeSchema).max(6),
  footerNote: z.string().trim().max(300).nullable(),
} satisfies Record<keyof SiteContent, z.ZodTypeAny>;

export type AppearanceBlock = keyof typeof schemas;

/**
 * Save one block.
 *
 * The block name decides which shape the value is checked against, so a single
 * action serves the whole editor without becoming an untyped bag.
 */
export async function saveAppearance(input: {
  block: AppearanceBlock;
  value: unknown;
}): Promise<AppearanceResult> {
  const actor = await requirePermission('cms:write');

  const schema = schemas[input.block];
  if (!schema) return { ok: false, error: 'Unknown block.' };

  const parsed = schema.safeParse(input.value);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the highlighted fields.' };
  }

  await saveSiteContent({ [input.block]: parsed.data } as Partial<SiteContent>, actor.id);

  await audit.record({
    actor,
    action: 'content.appearance',
    entityType: 'siteContent',
    entityId: input.block,
    entityLabel: input.block,
    severity: 'INFO',
  });

  refreshStorefront();
  return { ok: true };
}

/** Put a block back to what the shop ships with. */
export async function resetAppearance(input: {
  block: AppearanceBlock;
}): Promise<AppearanceResult> {
  const actor = await requirePermission('cms:write');
  if (!schemas[input.block]) return { ok: false, error: 'Unknown block.' };

  await saveSiteContent(
    { [input.block]: DEFAULT_SITE_CONTENT[input.block] } as Partial<SiteContent>,
    actor.id,
  );

  await audit.record({
    actor,
    action: 'content.appearance.reset',
    entityType: 'siteContent',
    entityId: input.block,
    entityLabel: input.block,
    severity: 'NOTICE',
  });

  refreshStorefront();
  return { ok: true };
}

/**
 * The header and footer are on every page, so nothing narrower would do.
 *
 * `layout` scope: these live in the storefront layout rather than in any one
 * route, and revalidating a path alone would leave every other page holding
 * the old strip.
 */
function refreshStorefront(): void {
  revalidatePath('/', 'layout');
  revalidatePath('/admin/appearance');
}
