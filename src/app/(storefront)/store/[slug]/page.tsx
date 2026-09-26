import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { atLeastOne, PLACEHOLDER_SLUG } from '@/lib/static-params';
import { JsonLd } from '@/components/seo/json-ld';
import { StorePageView } from '@/components/store/store-page-view';
import { absoluteUrl } from '@/config/site';
import { isIndexableListing, parseProductQuery, type RawSearchParams } from '@/lib/product-query';
import { breadcrumbListJsonLd, sellerJsonLd } from '@/lib/seo/structured-data';
import { getSellerBySlug, listSellers } from '@/server/services/catalog';
import { getSiteContent } from '@/server/services/site-content';

/**
 * Public store page.
 *
 * Note the path: `/store/[slug]`, not `/seller/[slug]`. The brief lists both a
 * public seller page and a `/seller/*` console; those collide, and a store
 * whose slug happened to be "orders" would shadow a console route. `/store` is
 * unambiguous and matches what a shopper thinks they are looking at.
 *
 * The operational numbers (dispatch rate, rating, order count) are shown
 * deliberately: on a marketplace the seller is part of what is being bought,
 * and hiding their record helps only the bad ones.
 */

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<RawSearchParams>;
}

export async function generateStaticParams() {
  return atLeastOne(
    async () => (await listSellers(100)).map((seller) => ({ slug: seller.slug })),
    { slug: PLACEHOLDER_SLUG },
  );
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const seller = await getSellerBySlug(slug);
  if (!seller) return {};

  const query = parseProductQuery(await searchParams, { sellerSlug: slug });

  return {
    title: `${seller.displayName} — Store`,
    description: seller.tagline ?? seller.about.slice(0, 155),
    alternates: { canonical: absoluteUrl(`/store/${seller.slug}`) },
    robots: isIndexableListing(query) ? undefined : { index: false, follow: true },
  };
}

export default async function StorePage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const [seller, { storePage }] = await Promise.all([getSellerBySlug(slug), getSiteContent()]);

  if (!seller || !['ACTIVE', 'APPROVED'].includes(seller.status)) notFound();
  if (seller.slug !== slug) permanentRedirect(`/store/${seller.slug}`);

  const url = absoluteUrl(`/store/${seller.slug}`);

  return (
    <>
      {/* Structured data whatever the layout: search engines read it, shoppers do not. */}
      <JsonLd
        data={[
          breadcrumbListJsonLd([
            { name: 'Home', url: absoluteUrl('/') },
            { name: 'Sellers', url: absoluteUrl('/stores') },
            { name: seller.displayName, url },
          ]),
          sellerJsonLd(seller, url),
        ]}
      />

      {/* Which layout, and which of its pieces, is decided under Admin › Store page. */}
      <StorePageView
        seller={seller}
        variant={storePage.variant}
        settings={storePage.settings[storePage.variant]}
        searchParams={searchParams}
        basePath={`/store/${seller.slug}`}
      />
    </>
  );
}
