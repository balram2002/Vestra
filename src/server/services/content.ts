import 'server-only';

import { cacheLife, cacheTag } from 'next/cache';

import { DEFAULT_HERO_SLIDES } from '@/config/home';
import type { Banner, CmsPage, HomeSection } from '@/domain/types';

import { collections, toEntities, toEntity } from '../db/collections';
import { tags } from './cache-tags';

/**
 * CMS content.
 *
 * The homepage is composition data, not code: `homeSections` decides what
 * appears, in what order, and where each rail sources its products. The
 * renderer maps `kind` to a component and nothing else. That is what lets the
 * marketing team reorder the page without a deploy — and why there is no
 * hardcoded homepage anywhere in this codebase.
 */

export async function getHomeSections(): Promise<HomeSection[]> {
  'use cache';
  cacheTag(tags.content);
  cacheLife('minutes');

  const sections = await collections.homeSections();
  const docs = await sections.find({ isActive: true }).sort({ position: 1 }).toArray();

  const now = Date.now();

  // Scheduling is applied here rather than in the query so a section whose
  // window has just opened does not need a separate cache key per minute.
  return toEntities(docs).filter((section) => {
    if (section.startsAt && Date.parse(section.startsAt) > now) return false;
    if (section.endsAt && Date.parse(section.endsAt) < now) return false;
    return true;
  });
}

export async function getBanners(placement: Banner['placement']): Promise<Banner[]> {
  'use cache';
  cacheTag(tags.content);
  cacheLife('minutes');

  const banners = await collections.banners();
  const docs = await banners
    .find({ placement, isActive: true })
    .sort({ position: 1 })
    .toArray();

  const now = Date.now();

  return toEntities(docs).filter((banner) => {
    if (banner.startsAt && Date.parse(banner.startsAt) > now) return false;
    if (banner.endsAt && Date.parse(banner.endsAt) < now) return false;
    return true;
  });
}

/**
 * The hero's slides: the shop's own live HOME_HERO banners, or the built-in
 * default set when there are none, so a new shop never opens on an empty
 * first screen. Hiding the hero section itself is how to have no hero at all.
 */
export async function getHeroSlides(): Promise<Banner[]> {
  const banners = await getBanners('HOME_HERO');
  return banners.length > 0 ? banners : DEFAULT_HERO_SLIDES;
}

/* ------------------------------------------------------------- cms pages */

/**
 * A policy or help page.
 *
 * Slugs carry their section (`legal/terms`, `help/shipping`), so one lookup
 * serves every content route and adding a section needs no new query.
 */
export async function getCmsPage(slug: string): Promise<CmsPage | null> {
  'use cache';
  cacheTag(tags.content);
  cacheLife('hours');

  const pages = await collections.cmsPages();
  return toEntity(await pages.findOne({ slug, isPublished: true }));
}

/** Every published page in a section, for index listings and the sitemap. */
export async function listCmsPages(prefix?: string): Promise<CmsPage[]> {
  'use cache';
  cacheTag(tags.content);
  cacheLife('hours');

  const pages = await collections.cmsPages();
  const filter = prefix
    ? { isPublished: true, slug: { $regex: `^${prefix}/` } }
    : { isPublished: true };

  const docs = await pages.find(filter).sort({ slug: 1 }).toArray();
  return toEntities(docs);
}
