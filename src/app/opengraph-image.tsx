import { siteConfig } from '@/config/site';
import { OG_CONTENT_TYPE, OG_SIZE, ogCard } from '@/lib/og/card';

/**
 * The site-wide fallback card.
 *
 * Inherited by every page that does not generate its own — home, search,
 * checkout, the CMS pages. Without it a `summary_large_image` Twitter card has
 * no image to show, and every share of those pages renders as a bare link.
 */
export const alt = `${siteConfig.name} — ${siteConfig.tagline}`;
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function OpengraphImage() {
  /*
   * Deliberately NOT the tagline: the card already prints that along its
   * baseline, and a card that says the same sentence twice reads as a
   * templating mistake rather than as a brand.
   */
  return ogCard({
    title: 'Fashion, beauty and lifestyle from verified sellers',
    subtitle: 'Transparent pricing, easy returns and fast delivery across India.',
  });
}
