import 'server-only';
import type { Category, HomeSection } from '@/domain/types';
import { getCategoryTree } from './catalog';
import { collections, toEntities } from '../db/collections';

/** Deterministic defaults use the current taxonomy, including every child. */
export async function categoryPageDefaults(): Promise<HomeSection[]> {
  const categories = await getCategoryTree();
  return categories.filter((category) => category.depth === 0).map((department, position) => ({
    id: `category-page-${department.id}`, defaultKey: `categories:${department.id}`,
    page: 'categories', kind: 'CATEGORY_STRIP', title: department.name,
    subtitle: `Explore ${department.name.toLowerCase()}, from everyday favourites to something special.`,
    href: `/category/${department.slug}`, ctaLabel: `All ${department.name}`,
    position, isActive: true, startsAt: null, endsAt: null, visibleOn: 'ALL',
    config: { categoryIds: categories.filter((category) => category.id === department.id || category.path[0] === department.slug).map((category) => category.id), limit: 48, layout: 'GRID_4' },
    updatedAt: department.updatedAt, updatedByUserId: null,
  }));
}
export async function categoryPageEditorSections(): Promise<HomeSection[]> {
  const col = await collections.homeSections();
  const existing = await col.find({ page: 'categories' }).sort({ position: 1 }).toArray();
  return existing.length ? toEntities(existing) : categoryPageDefaults();
}
/** Fill image gaps from actual catalogue media, then ancestors. */
export async function categoryPageImages(categories: Category[]): Promise<Category[]> {
  const tree = await getCategoryTree();
  const products = await collections.products();
  return Promise.all(categories.map(async (category) => {
    if (category.imageUrl) return category;
    const product = await products.findOne({ status: 'PUBLISHED', categoryPath: category.slug, 'media.0': { $exists: true } });
    const ancestor = [...category.path].reverse().map((slug) => tree.find((entry) => entry.slug === slug)).find((entry) => entry?.imageUrl);
    return { ...category, imageUrl: product?.media[0]?.url ?? ancestor?.imageUrl ?? '' };
  }));
}
