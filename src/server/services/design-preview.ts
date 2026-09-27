import 'server-only';

import type { PreviewEntity } from '@/domain/page-designs/types';

import { requirePermission } from '../auth/session';
import { collections } from '../db/collections';
import { getCategoryTree, getProductBySlug, getTopProductSlugs, listBrands, listSellers } from './catalog';

/**
 * How many stores have picked each store-page layout, for the designer's
 * "Sellers may choose" panel: withdrawing a layout moves these stores back
 * to the default, and Marketing should see that before publishing.
 */
export async function sellerLayoutCounts(): Promise<Record<string, number>> {
  await requirePermission('cms:write');
  const sellers = await collections.sellers();
  const rows = await sellers
    .aggregate<{ _id: string; count: number }>([
      { $match: { storefrontLayout: { $type: 'string' }, status: { $in: ['ACTIVE', 'APPROVED'] } } },
      { $group: { _id: '$storefrontLayout', count: { $sum: 1 } } },
    ])
    .toArray();
  return Object.fromEntries(rows.map((row) => [row._id, row.count]));
}

/**
 * The real records a designer can preview its page with.
 *
 * Real ones, deliberately: a layout that only ever looks right on a store
 * with a perfect banner and a three-word name has not been tested. The list
 * leads with records that exercise the layout -- stores that are trading --
 * and is short, because it is a picker, not a search.
 */
export async function previewEntities(
  entity: PreviewEntity,
): Promise<{ label: string; options: Array<{ value: string; label: string }> }> {
  await requirePermission('cms:write');

  switch (entity) {
    case 'seller': {
      const sellers = await listSellers(40);
      return {
        label: 'Preview with store',
        options: sellers
          .filter((seller) => ['ACTIVE', 'APPROVED'].includes(seller.status))
          .map((seller) => ({ value: seller.slug, label: seller.displayName })),
      };
    }
    case 'product': {
      // Bestsellers first: the pages most shoppers actually land on.
      const slugs = await getTopProductSlugs(30);
      const products = await Promise.all(slugs.map((slug) => getProductBySlug(slug)));
      return {
        label: 'Preview with product',
        options: products
          .filter((product): product is NonNullable<typeof product> => Boolean(product))
          .map((product) => ({ value: product.slug, label: product.title.slice(0, 60) })),
      };
    }
    case 'category': {
      // Departments first, then what is inside them: a department page has
      // the most sub-categories, which is what a layout has to carry well.
      const tree = await getCategoryTree();
      const byId = new Map(tree.map((category) => [category.id, category]));
      return {
        label: 'Preview with category',
        options: tree.map((category) => {
          const parent = category.parentId ? byId.get(category.parentId) : null;
          return { value: category.slug, label: parent ? `${parent.name} › ${category.name}` : category.name };
        }),
      };
    }
    case 'brand': {
      // Biggest ranges first: a brand with three products shows little.
      const brands = await listBrands(60);
      return {
        label: 'Preview with brand',
        options: brands.map((brand) => ({ value: brand.slug, label: `${brand.name} (${brand.productCount})` })),
      };
    }
    case 'query': {
      // Every state a search page has, not just the happy one: real words,
      // a brand, a misspelling, nothing found, and no search at all.
      const [tree, brands] = await Promise.all([getCategoryTree(), listBrands(1)]);
      // The most specific categories: "kurtas" is a search, "ethnic wear" a department.
      const words = tree
        .toSorted((a, b) => b.depth - a.depth || a.position - b.position)
        .slice(0, 3)
        .map((category) => category.name.toLowerCase());
      const typo = words[0] && words[0].length > 4 ? `${words[0].slice(0, 2)}${words[0][3]}${words[0][2]}${words[0].slice(4)}` : null;
      return {
        label: 'Preview with search',
        options: [
          ...words.map((word) => ({ value: word, label: `“${word}”` })),
          ...brands.map((brand) => ({ value: brand.name.toLowerCase(), label: `“${brand.name.toLowerCase()}” (a brand)` })),
          ...(typo ? [{ value: typo, label: `“${typo}” (misspelt)` }] : []),
          { value: 'zqxwv', label: 'A search that finds nothing' },
          { value: '', label: 'An empty search' },
        ],
      };
    }
    default:
      return { label: 'Preview with', options: [] };
  }
}
