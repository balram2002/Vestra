/**
 * Cache tag vocabulary.
 *
 * Every `"use cache"` scope tags itself through this module, and every mutation
 * invalidates through it. Keeping the strings in one place is what makes
 * targeted invalidation actually work: a price change on one product should
 * expire that product's page and the listings it appears in — not the whole
 * catalogue, and certainly not force a redeploy.
 *
 * Tags are layered deliberately:
 *
 *   product(id)        one PDP
 *   productList        any grid, because a price or stock change reorders them
 *   category(slug)     one category page and its facets
 *   taxonomy           the mega menu and footer nav, which change rarely
 *
 * A mutation tags UP the tree only as far as it must. Editing a product's
 * description touches `product(id)` alone; changing its price also touches
 * `productList` because sort orders and price facets move.
 *
 * Deliberately dependency-free so client and server modules can both import it.
 */

export const tags = {
  /** One product, by id. */
  product: (id: string) => `product:${id}`,
  /** Any surface that renders a grid or rail of products. */
  productList: 'product:list',

  category: (slug: string) => `category:${slug}`,
  /** The category tree itself: mega menu, footer, breadcrumbs. */
  taxonomy: 'taxonomy',

  brand: (slug: string) => `brand:${slug}`,
  brandList: 'brand:list',

  seller: (slug: string) => `seller:${slug}`,
  sellerList: 'seller:list',

  /** Reviews for one product; separate so posting one does not expire the PDP shell. */
  reviews: (productId: string) => `reviews:${productId}`,

  /** Homepage composition, banners and navigation, all editable in the CMS. */
  content: 'content',

  coupons: 'coupons',
  promotions: 'promotions',
} as const;

/**
 * Tags to invalidate when a product changes.
 *
 * `scope` tells the caller how far the blast radius reaches, so a catalogue
 * edit does not needlessly expire every listing in the shop.
 */
export function productTags(
  productId: string,
  scope: 'content' | 'price' | 'stock' | 'status',
): string[] {
  const base = [tags.product(productId)];

  switch (scope) {
    case 'content':
      // Copy and imagery: only the product's own surfaces.
      return base;
    case 'price':
    case 'status':
      // Reorders grids and moves price facets.
      return [...base, tags.productList];
    case 'stock':
      // Size availability shows on cards too, so grids must refresh.
      return [...base, tags.productList];
  }
}
