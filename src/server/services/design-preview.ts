import 'server-only';

import type { PreviewEntity } from '@/domain/page-designs/types';

import { requirePermission } from '../auth/session';
import { getProductBySlug, getTopProductSlugs, listSellers } from './catalog';

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
    default:
      return { label: 'Preview with', options: [] };
  }
}
