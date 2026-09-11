/**
 * Home section renderers — the barrel.
 *
 * One component per `HomeSectionKind`, each in its own file. The page maps
 * `kind` to a renderer and passes the section's own `config`; no component here
 * knows where it sits on the page, which is what makes the CMS ordering real
 * rather than cosmetic.
 *
 * This file used to BE all of them — six sections and a shared frame in one
 * 400-line module. Splitting them apart is not tidiness for its own sake: the
 * hero and the product rail are the two surfaces that get iterated on most, and
 * having them in their own files means a change to the hero cannot accidentally
 * reflow the seller cards, and a diff on the rail is a diff about the rail.
 *
 * Kept as a barrel so the page imports from one place and the split stays an
 * implementation detail.
 */
export { BannerGrid } from './banner-grid';
export { BrandStrip } from './brand-strip';
export { CategoryRail } from './category-rail';
export { HeroCarousel, HeroSkeleton } from './hero-carousel';
export { ProductRail } from './product-rail';
export { Section } from './section';
export { SellerSpotlight } from './seller-spotlight';
export { ValueProps } from './value-props';
