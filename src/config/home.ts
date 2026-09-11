import type { Banner } from '@/domain/types';

/**
 * The homepage hero before any banners exist.
 *
 * A new shop has no campaigns yet, and a hero that renders nothing leaves the
 * first screen of the site empty. These five fill it until an administrator
 * adds a hero banner under Admin, Homepage, where they can also be copied into
 * real banners with one click and then edited, reordered or hidden like any
 * other.
 *
 * The copy is deliberately modest: each slide names a department and links to
 * it, or to the seller application. Nothing promises a product, a price or a
 * discount the shop may not have yet.
 *
 * The pictures are files in `public/hero`, a wide crop and a portrait one per
 * slide, rather than remote photographs. Unsplash renders a new size of a
 * photograph on demand, and at desktop widths that took up to fourteen seconds
 * a picture: the default hero held a first visit's page load for over forty.
 * Served from the site itself they are ready at once, at 80 to 190 KB each.
 */

type SlideCopy = Pick<Banner, 'name' | 'eyebrow' | 'headline' | 'subheadline' | 'ctaLabel' | 'href' | 'alt'> & {
  /** The picture's file name in `public/hero`, without the crop suffix. */
  image: string;
};

const slide = (index: number, copy: SlideCopy): Banner => ({
  id: `default-hero-${index + 1}`,
  name: copy.name,
  placement: 'HOME_HERO',
  eyebrow: copy.eyebrow,
  headline: copy.headline,
  subheadline: copy.subheadline,
  ctaLabel: copy.ctaLabel,
  href: copy.href,
  // 1920 by 864 for the desktop panel, 900 by 1125 for a phone.
  imageUrl: `/hero/${copy.image}-desktop.jpg`,
  mobileImageUrl: `/hero/${copy.image}-mobile.jpg`,
  alt: copy.alt,
  theme: 'light',
  position: index,
  isActive: true,
  startsAt: null,
  endsAt: null,
  impressions: 0,
  clicks: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

export const DEFAULT_HERO_SLIDES: Banner[] = [
  slide(0, {
    name: 'Women',
    eyebrow: 'Women',
    headline: 'Drape, print and pleat',
    subheadline: 'Sarees, kurtas, dresses and everyday western wear, from independent labels.',
    ctaLabel: 'Shop women',
    href: '/category/women',
    alt: 'A woman in a purple silk saree with a gold border, against a red backdrop',
    image: 'women',
  }),
  slide(1, {
    name: 'Men',
    eyebrow: 'Men',
    headline: 'Menswear, sorted',
    subheadline: 'Shirts, trousers, ethnic wear and footwear, all in one place.',
    ctaLabel: 'Shop men',
    href: '/category/men',
    alt: 'Brown leather brogues in their box beside a checked shirt and a wristwatch',
    image: 'men',
  }),
  slide(2, {
    name: 'Home & Living',
    eyebrow: 'Home & Living',
    headline: 'Make it feel like home',
    subheadline: 'Bed linen, cushions and throws for every room.',
    ctaLabel: 'Shop home',
    href: '/category/home-and-living',
    alt: 'A bright living room with a pale sofa, cushions and woven wall art',
    image: 'home',
  }),
  slide(3, {
    name: 'Beauty',
    eyebrow: 'Beauty',
    headline: 'Beauty, simply',
    subheadline: 'Skincare and fragrance for every day.',
    ctaLabel: 'Shop beauty',
    href: '/category/beauty',
    alt: 'A lipstick, brushes and a compact laid out on a beige background',
    image: 'beauty',
  }),
  slide(4, {
    name: 'Sell on VestraWAB',
    eyebrow: 'For sellers',
    headline: 'Your store, on VestraWAB',
    subheadline: 'Apply in two minutes with your business details, and start listing once you are approved.',
    ctaLabel: 'Start selling',
    href: '/sell-with-us',
    alt: 'A boutique with rails of clothes under hanging lamps',
    image: 'sell',
  }),
];
