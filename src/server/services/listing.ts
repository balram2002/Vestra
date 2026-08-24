import 'server-only';

import { cacheLife, cacheTag } from 'next/cache';
import type { Filter } from 'mongodb';

import { CATALOG } from '@/config/business';
import { COLOR_BY_VALUE, sortSizes } from '@/domain/attributes';
import type {
  Facet,
  PriceFacet,
  Product,
  ProductListResult,
  ProductQuery,
  ProductSort,
} from '@/domain/types';

import { collections, type Doc, toEntities } from '../db/collections';
import { tags } from './cache-tags';
import { toSummaries } from './catalog';

/**
 * Product listing.
 *
 * One query path serves the category pages, search results, brand pages and
 * store pages, because they differ only in their filter — not in how they
 * paginate, sort or build facets. Duplicating this per surface is how the four
 * of them end up quietly disagreeing about what is in stock.
 *
 * Facet counts are computed with `$facet`, so the result set and every facet
 * histogram come back in ONE round trip rather than one query per filter group.
 */

const SORTS: Record<ProductSort, Record<string, 1 | -1>> = {
  relevance: { 'stats.conversionRate': -1, 'stats.unitsSold30d': -1 },
  popularity: { 'stats.unitsSold30d': -1, 'rating.count': -1 },
  newest: { publishedAt: -1 },
  'price-asc': { 'priceRange.minSellingPrice': 1 },
  'price-desc': { 'priceRange.minSellingPrice': -1 },
  discount: { maxDiscountPercent: -1 },
  rating: { 'rating.average': -1, 'rating.count': -1 },
};

/** Translate the URL-shaped query into a Mongo filter. */
function buildFilter(query: ProductQuery, brandIds: string[], sellerId: string | null) {
  const filter: Filter<Doc<Product>> = { status: 'PUBLISHED' };
  const and: Filter<Doc<Product>>[] = [];

  if (query.categorySlug) {
    // `categoryPath` is denormalised onto the product, so a department page is
    // the same single-field query as a leaf page — no ancestor expansion.
    filter.categoryPath = query.categorySlug;
  }
  if (brandIds.length > 0) filter.brandId = { $in: brandIds };
  if (sellerId) filter.sellerId = sellerId;
  if (query.genders?.length) filter.gender = { $in: query.genders };

  if (query.q) {
    filter.$text = { $search: query.q };
  }

  if (query.minPrice != null || query.maxPrice != null) {
    const range: Record<string, number> = {};
    if (query.minPrice != null) range.$gte = query.minPrice;
    if (query.maxPrice != null) range.$lte = query.maxPrice;
    filter['priceRange.minSellingPrice'] = range;
  }

  if (query.minDiscount) filter.maxDiscountPercent = { $gte: query.minDiscount };
  if (query.minRating) filter['rating.average'] = { $gte: query.minRating };

  // Colour and size live on variants. `$elemMatch` is required so that "size M"
  // and "in stock" must be satisfied by the SAME variant — without it a product
  // with a sold-out M and an in-stock XL would wrongly match.
  const variantConditions: Record<string, unknown> = {};
  if (query.colors?.length) variantConditions.color = { $in: query.colors };
  if (query.sizes?.length) variantConditions.size = { $in: query.sizes };
  if (query.inStockOnly) variantConditions['inventory.available'] = { $gt: 0 };

  if (Object.keys(variantConditions).length > 0) {
    and.push({ variants: { $elemMatch: variantConditions } });
  }

  if (query.attributes) {
    for (const [key, values] of Object.entries(query.attributes)) {
      if (values.length > 0) and.push({ [`attributes.${key}`]: { $in: values } });
    }
  }

  if (and.length > 0) filter.$and = and;
  return filter;
}

export async function listProducts(query: ProductQuery): Promise<ProductListResult> {
  'use cache';
  // Any price, stock or publish change can reorder a grid or move a facet.
  cacheTag(tags.productList);
  if (query.categorySlug) cacheTag(tags.category(query.categorySlug));
  cacheLife('minutes');

  const page = Math.max(1, query.page ?? 1);
  const pageSize = Math.min(query.pageSize ?? CATALOG.productsPerPage, 96);
  const sort = query.sort ?? (query.q ? 'relevance' : 'popularity');

  const products = await collections.products();

  // Slugs arrive in the URL; ids are what the documents carry.
  const [brandIds, sellerId] = await Promise.all([
    resolveBrandIds(query.brandSlugs),
    resolveSellerId(query.sellerSlug),
  ]);

  const filter = buildFilter(query, brandIds, sellerId);

  const sortStage: Record<string, unknown> = query.q
    ? { score: { $meta: 'textScore' }, ...SORTS[sort] }
    : SORTS[sort];

  const [result] = await products
    .aggregate<{
      items: Doc<Product>[];
      total: Array<{ count: number }>;
      colors: Array<{ _id: string; count: number }>;
      sizes: Array<{ _id: string; count: number }>;
      brands: Array<{ _id: string; count: number }>;
      price: Array<{ min: number; max: number }>;
      buckets: Array<{ _id: number; count: number }>;
      ratings: Array<{ _id: number; count: number }>;
    }>([
      { $match: filter },
      {
        // One pass over the matched set produces the page AND every facet.
        $facet: {
          items: [{ $sort: sortStage }, { $skip: (page - 1) * pageSize }, { $limit: pageSize }],
          total: [{ $count: 'count' }],
          colors: [
            { $unwind: '$variants' },
            { $group: { _id: '$variants.color', count: { $addToSet: '$_id' } } },
            { $project: { count: { $size: '$count' } } },
            { $sort: { count: -1 } },
            { $limit: 40 },
          ],
          sizes: [
            { $unwind: '$variants' },
            { $group: { _id: '$variants.size', count: { $addToSet: '$_id' } } },
            { $project: { count: { $size: '$count' } } },
          ],
          brands: [
            { $group: { _id: '$brandId', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $limit: 40 },
          ],
          price: [
            {
              $group: {
                _id: null,
                min: { $min: '$priceRange.minSellingPrice' },
                max: { $max: '$priceRange.minSellingPrice' },
              },
            },
          ],
          buckets: [
            {
              $bucketAuto: { groupBy: '$priceRange.minSellingPrice', buckets: 12 },
            },
            { $project: { _id: '$_id.min', count: 1 } },
          ],
          ratings: [
            { $match: { 'rating.count': { $gt: 0 } } },
            { $group: { _id: { $floor: '$rating.average' }, count: { $sum: 1 } } },
          ],
        },
      },
    ])
    .toArray();

  const docs = result?.items ?? [];
  const total = result?.total?.[0]?.count ?? 0;
  const items = await toSummaries(toEntities(docs));

  return {
    items,
    total,
    page,
    pageSize,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    facets: await buildFacets(result, query),
    priceFacet: buildPriceFacet(result),
    appliedFilterCount: countApplied(query),
  };
}

/* ----------------------------------------------------------------- facets */

/** The raw `$facet` output the facet builders read from. */
interface FacetAggregation {
  colors?: Array<{ _id: string; count: number }>;
  sizes?: Array<{ _id: string; count: number }>;
  brands?: Array<{ _id: string; count: number }>;
  ratings?: Array<{ _id: number; count: number }>;
  price?: Array<{ min: number; max: number }>;
  buckets?: Array<{ _id: number; count: number }>;
}

async function buildFacets(
  source: FacetAggregation | undefined,
  query: ProductQuery,
): Promise<Facet[]> {
  const facets: Facet[] = [];

  const colors = source?.colors ?? [];
  if (colors.length > 0) {
    facets.push({
      key: 'color',
      label: 'Colour',
      kind: 'color',
      defaultOpen: true,
      values: colors.map((c) => ({
        value: c._id,
        label: COLOR_BY_VALUE.get(c._id)?.label ?? c._id,
        count: c.count,
        hex: COLOR_BY_VALUE.get(c._id)?.hex,
      })),
    });
  }

  const sizes = source?.sizes ?? [];
  if (sizes.length > 0) {
    // Sorted by the size system, not alphabetically: "XL" must not precede "S".
    const order = sortSizes(sizes.map((s) => s._id));
    const bySize = new Map(sizes.map((s) => [s._id, s.count]));
    facets.push({
      key: 'size',
      label: 'Size',
      kind: 'size',
      defaultOpen: true,
      values: order.map((value) => ({ value, label: value, count: bySize.get(value) ?? 0 })),
    });
  }

  const brandCounts = source?.brands ?? [];
  if (brandCounts.length > 1) {
    const brandCol = await collections.brands();
    const brandDocs = await brandCol
      .find({ _id: { $in: brandCounts.map((b) => b._id) } })
      .toArray();
    const byId = new Map(toEntities(brandDocs).map((b) => [b.id, b]));

    facets.push({
      key: 'brand',
      label: 'Brand',
      kind: 'checkbox',
      defaultOpen: true,
      searchable: brandCounts.length > 8,
      values: brandCounts
        .map((b) => {
          const brand = byId.get(b._id);
          return brand ? { value: brand.slug, label: brand.name, count: b.count } : null;
        })
        .filter((v): v is { value: string; label: string; count: number } => Boolean(v)),
    });
  }

  const ratings = source?.ratings ?? [];
  if (ratings.length > 0) {
    // Cumulative: "4★ & above" must include the 5★ products too.
    const values = [4, 3, 2].map((floor) => ({
      value: String(floor),
      label: `${floor}★ & above`,
      count: ratings.filter((r) => r._id >= floor).reduce((sum, r) => sum + r.count, 0),
    }));
    facets.push({
      key: 'rating',
      label: 'Customer rating',
      kind: 'rating',
      defaultOpen: false,
      values: values.filter((v) => v.count > 0),
    });
  }

  facets.push({
    key: 'discount',
    label: 'Discount',
    kind: 'checkbox',
    defaultOpen: false,
    values: [10, 20, 30, 40, 50, 60].map((d) => ({
      value: String(d),
      label: `${d}% and above`,
      count: 0,
    })),
  });

  void query;
  return facets;
}

function buildPriceFacet(source: FacetAggregation | undefined): PriceFacet {
  const min = source?.price?.[0]?.min ?? 0;
  const max = source?.price?.[0]?.max ?? 0;
  const raw = source?.buckets ?? [];

  const buckets = raw.map((bucket, index) => ({
    from: bucket._id,
    to: raw[index + 1]?._id ?? max,
    count: bucket.count,
  }));

  return { min, max, buckets };
}

function countApplied(query: ProductQuery): number {
  let count = 0;
  if (query.brandSlugs?.length) count += query.brandSlugs.length;
  if (query.colors?.length) count += query.colors.length;
  if (query.sizes?.length) count += query.sizes.length;
  if (query.genders?.length) count += query.genders.length;
  if (query.minPrice != null || query.maxPrice != null) count += 1;
  if (query.minDiscount) count += 1;
  if (query.minRating) count += 1;
  if (query.inStockOnly) count += 1;
  for (const values of Object.values(query.attributes ?? {})) count += values.length;
  return count;
}

/* ---------------------------------------------------------------- lookups */

async function resolveBrandIds(slugs: string[] | undefined): Promise<string[]> {
  if (!slugs?.length) return [];
  const brands = await collections.brands();
  const docs = await brands.find({ slug: { $in: slugs } }, { projection: { _id: 1 } }).toArray();
  return docs.map((d) => d._id);
}

async function resolveSellerId(slug: string | undefined): Promise<string | null> {
  if (!slug) return null;
  const sellers = await collections.sellers();
  const doc = await sellers.findOne({ slug }, { projection: { _id: 1 } });
  return doc?._id ?? null;
}

/* ------------------------------------------------------------------ rails */

/** A homepage or PDP rail. Small, cached hard, never paginated. */
export async function getProductRail(
  source: 'NEW_ARRIVALS' | 'BESTSELLERS' | 'TRENDING' | 'DEALS',
  limit: number = CATALOG.railSize,
  categorySlug?: string,
): Promise<ProductListResult['items']> {
  'use cache';
  cacheTag(tags.productList);
  cacheLife('minutes');

  const products = await collections.products();
  const filter: Filter<Doc<Product>> = { status: 'PUBLISHED' };
  if (categorySlug) filter.categoryPath = categorySlug;

  const sort: Record<string, 1 | -1> =
    source === 'NEW_ARRIVALS'
      ? { publishedAt: -1 }
      : source === 'BESTSELLERS'
        ? { 'stats.unitsSold30d': -1 }
        : source === 'TRENDING'
          ? { 'stats.views30d': -1 }
          : { maxDiscountPercent: -1 };

  if (source === 'DEALS') filter.maxDiscountPercent = { $gte: 30 };

  const docs = await products.find(filter).sort(sort).limit(limit).toArray();
  return toSummaries(toEntities(docs));
}

/** Related products for a PDP: same leaf category, different style. */
export async function getRelatedProducts(
  product: Product,
  limit: number = CATALOG.railSize,
): Promise<ProductListResult['items']> {
  'use cache';
  cacheTag(tags.productList);
  cacheLife('hours');

  const products = await collections.products();
  const docs = await products
    .find({
      status: 'PUBLISHED',
      categoryId: product.categoryId,
      _id: { $ne: product.id },
    })
    .sort({ 'stats.unitsSold30d': -1 })
    .limit(limit)
    .toArray();

  return toSummaries(toEntities(docs));
}
