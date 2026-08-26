import { OG_CONTENT_TYPE, OG_SIZE, ogCard } from '@/lib/og/card';
import { getCategoryBySlug } from '@/server/services/catalog';

/**
 * Per-category card.
 *
 * A category has a banner often enough to set one in `openGraph.images`, but
 * not always — and a shared department banner says nothing about WHICH
 * category was shared. This names it.
 */
export const alt = 'Category';
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default async function CategoryOpengraphImage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);

  if (!category) {
    return ogCard({ title: 'Shop the collection' });
  }

  // The ancestry minus the category itself: "Women · Ethnic wear" above
  // "Kurtas", which is the context a shared link otherwise loses.
  const ancestry = category.path
    .slice(0, -1)
    .map((segment) => segment.replace(/-/g, ' '))
    .join(' · ');

  return ogCard({
    eyebrow: ancestry || null,
    title: category.name,
    subtitle: category.metaDescription ?? category.description,
  });
}
