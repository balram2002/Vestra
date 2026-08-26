import { OG_CONTENT_TYPE, OG_SIZE, ogCard } from '@/lib/og/card';
import { getSellerBySlug } from '@/server/services/catalog';

/**
 * Per-store card.
 *
 * On a marketplace the seller is part of what is being bought, so a shared
 * store link should carry who they are and where they trade from — the same
 * things the page itself leads with.
 */
export const alt = 'Store';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function StoreOpengraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const seller = await getSellerBySlug(slug);

  if (!seller) {
    return ogCard({ title: 'Shop verified sellers' });
  }

  return ogCard({
    eyebrow: 'Store',
    title: seller.displayName,
    subtitle: seller.tagline ?? seller.about ?? null,
  });
}
