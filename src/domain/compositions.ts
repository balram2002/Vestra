import type { Banner, HomeSection } from './types';

/**
 * Composed pages -- the homepage and the shop page -- published as a whole.
 *
 * The section builder and the banner manager edit the working copy in
 * `homeSections` and `banners`, exactly as they always have. Shoppers read a
 * PUBLISHED SNAPSHOT of that working copy instead, so a half-arranged page is
 * a draft until someone presses Publish, and every publish can be put back.
 */

export const COMPOSITION_PAGES = {
  home: {
    title: 'Homepage',
    path: '/',
    placements: ['HOME_HERO', 'HOME_GRID'] as Array<Banner['placement']>,
  },
  categories: {
    title: 'Shop page',
    path: '/categories',
    placements: [] as Array<Banner['placement']>,
  },
} as const;

export type CompositionPage = keyof typeof COMPOSITION_PAGES;

export function isCompositionPage(page: string): page is CompositionPage {
  return page in COMPOSITION_PAGES;
}

export interface CompositionSnapshot {
  sections: HomeSection[];
  banners: Banner[];
}

/**
 * Fields that record WHEN or HOW OFTEN, not WHAT: a save that changed nothing
 * is not a change, and a banner's impression and click counters move with
 * traffic, not with editing.
 */
const NOT_CONTENT = new Set(['updatedAt', 'createdAt', 'impressions', 'clicks']);

function comparable<T extends object>(item: T): string {
  return JSON.stringify(
    Object.fromEntries(Object.entries(item).filter(([key]) => !NOT_CONTENT.has(key)).sort(([a], [b]) => a.localeCompare(b))),
  );
}

const sectionName = (section: HomeSection) => `“${section.title || section.kind.toLowerCase().replace(/_/g, ' ')}”`;
const bannerName = (banner: Banner) => `“${banner.name || banner.headline || 'untitled'}”`;
const placementName = (placement: Banner['placement']) => (placement === 'HOME_HERO' ? 'hero slide' : 'grid tile');

/**
 * What publishing the working copy would change, in sentences, most visible
 * first. Empty when the draft and the live page are the same.
 */
export function compositionChanges(live: CompositionSnapshot, draft: CompositionSnapshot): string[] {
  const changes: string[] = [];

  const liveSections = new Map(live.sections.map((section) => [section.id, section]));
  const draftSections = new Map(draft.sections.map((section) => [section.id, section]));

  for (const section of draft.sections) {
    const before = liveSections.get(section.id);
    if (!before) changes.push(`Adds section ${sectionName(section)}`);
    else if (before.isActive !== section.isActive) {
      changes.push(`${section.isActive ? 'Shows' : 'Hides'} section ${sectionName(section)}`);
    } else if (comparable({ ...before, position: 0 }) !== comparable({ ...section, position: 0 })) {
      changes.push(`Edits section ${sectionName(section)}`);
    }
  }
  for (const section of live.sections) {
    if (!draftSections.has(section.id)) changes.push(`Removes section ${sectionName(section)}`);
  }

  const order = (sections: HomeSection[]) =>
    sections.filter((section) => liveSections.has(section.id) && draftSections.has(section.id))
      .sort((a, b) => a.position - b.position)
      .map((section) => section.id)
      .join(',');
  if (order(live.sections) !== order(draft.sections)) changes.push('Reorders sections');

  const liveBanners = new Map(live.banners.map((banner) => [banner.id, banner]));
  const draftBanners = new Map(draft.banners.map((banner) => [banner.id, banner]));
  for (const banner of draft.banners) {
    const before = liveBanners.get(banner.id);
    if (!before) changes.push(`Adds ${placementName(banner.placement)} ${bannerName(banner)}`);
    else if (comparable(before) !== comparable(banner)) changes.push(`Edits ${placementName(banner.placement)} ${bannerName(banner)}`);
  }
  for (const banner of live.banners) {
    if (!draftBanners.has(banner.id)) changes.push(`Removes ${placementName(banner.placement)} ${bannerName(banner)}`);
  }

  return changes;
}

/**
 * What a shopper sees from a snapshot at `nowMs`: switched on, inside its
 * window, in order. The same rule the live read has always applied.
 */
export function visibleNow<T extends { isActive: boolean; startsAt?: string | null; endsAt?: string | null; position: number }>(
  items: T[],
  nowMs: number,
): T[] {
  return items
    .filter((item) => item.isActive)
    .filter((item) => !(item.startsAt && Date.parse(item.startsAt) > nowMs))
    .filter((item) => !(item.endsAt && Date.parse(item.endsAt) < nowMs))
    .sort((a, b) => a.position - b.position);
}
