import type { Metadata } from 'next';
import { notFound, permanentRedirect } from 'next/navigation';
import { Suspense } from 'react';
import Image from 'next/image';
import Link from 'next/link';

import { atLeastOne, PLACEHOLDER_SLUG } from '@/lib/static-params';
import { Breadcrumbs } from '@/components/commerce/breadcrumbs';
import { ListingView } from '@/components/commerce/listing-view';
import { ProductGridSkeleton } from '@/components/skeletons/product-card-skeleton';
import { absoluteUrl } from '@/config/site';
import { isIndexableListing, parseProductQuery, type RawSearchParams } from '@/lib/product-query';
import { JsonLd } from '@/components/seo/json-ld';
import { breadcrumbListJsonLd, itemListJsonLd } from '@/lib/seo/structured-data';
import {
  getCategoryAncestors,
  getCategoryBySlug,
  getCategoryTree,
} from '@/server/services/catalog';
import { listProducts } from '@/server/services/listing';

/**
 * Category listing.
 *
 * The page splits into a cached shell and a dynamic grid on purpose:
 *
 *  - the breadcrumb, heading and SEO copy come from the category document and
 *    prerender, so the page paints immediately with real content;
 *  - the grid depends on `searchParams` (filters, sort, page), which is request
 *    state, so it sits behind `<Suspense>` and streams.
 *
 * That is why `searchParams` is awaited INSIDE the suspended child rather than
 * at the top: awaiting it in the page body would make the whole route dynamic
 * and throw away the static shell.
 */

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<RawSearchParams>;
}

/**
 * The taxonomy is a small fixed set, so every category page is prerendered.
 * Without this the route has no known params at build time and its shell
 * cannot be prerendered at all.
 */
export async function generateStaticParams() {
  return atLeastOne(
    async () => (await getCategoryTree()).map((category) => ({ slug: category.slug })),
    { slug: PLACEHOLDER_SLUG },
  );
}

export async function generateMetadata({ params, searchParams }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);
  if (!category) return {};

  const raw = await searchParams;
  const query = parseProductQuery(raw, { categorySlug: slug });
  const indexable = isIndexableListing(query);
  const page = query.page ?? 1;

  const title = category.metaTitle ?? `${category.name} — Buy ${category.name} Online`;

  return {
    title: page > 1 ? `${title} — Page ${page}` : title,
    description: category.metaDescription ?? category.description,
    alternates: {
      // Filtered and sorted variants all canonicalise to the clean category
      // URL, so their ranking signals consolidate rather than compete.
      canonical: absoluteUrl(`/category/${category.slug}`),
    },
    robots: indexable ? undefined : { index: false, follow: true },
    openGraph: {
      title,
      description: category.description,
      url: absoluteUrl(`/category/${category.slug}`),
      /*
       * No `images` here on purpose.
       *
       * Setting it would override the generated card in `opengraph-image.tsx`,
       * and the banner is the weaker choice: it is a wide lifestyle crop that
       * loses its subject at 1200×630, it is often shared across a whole
       * department, and it carries no text — so a shared link would not say
       * which category it was.
       */
    },
  };
}

export default async function CategoryPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const category = await getCategoryBySlug(slug);

  if (!category) notFound();

  // The slug resolved through history, so the canonical URL has moved. A 301
  // keeps inbound links and old sitemap entries working.
  if (category.slug !== slug) {
    permanentRedirect(`/category/${category.slug}`);
  }

  const ancestors = await getCategoryAncestors(category.slug);
  const children = (await getCategoryTree()).filter((item) => item.parentId === category.id);

  return (
    <div className="gutter shell-max py-5">
      <Breadcrumbs
        items={[
          { href: '/', label: 'Home' },
          ...ancestors.map((c) => ({ href: `/category/${c.slug}`, label: c.name })),
        ]}
      />

      <JsonLd
        data={breadcrumbListJsonLd([
          { name: 'Home', url: absoluteUrl('/') },
          ...ancestors.map((c) => ({
            name: c.name,
            url: absoluteUrl(`/category/${c.slug}`),
          })),
        ])}
      />

      {/*
        Tight on a phone.
        
        Breadcrumb, heading, description, a filter button, a count and a sort
        row used to fill roughly two thirds of a 844px screen before the first
        product. The description is clamped to two lines and the rest is folded
        into the sticky bar below, so the grid starts near the top where someone
        who came to shop is already looking.
      */}
      <header className="bg-ink relative mt-3 min-h-48 overflow-hidden rounded-3xl sm:min-h-64">
        {category.imageUrl ? <Image src={category.imageUrl} alt="" fill priority sizes="(min-width: 1024px) 1200px, 100vw" className="object-cover" /> : null}
        <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-black/10" />
        <div className="relative flex min-h-48 max-w-2xl flex-col justify-end p-5 text-white sm:min-h-64 sm:p-10">
        <p className="mb-2 text-xs font-semibold uppercase tracking-[0.2em] text-white/75">Explore the collection</p>
        <h1 className="font-display text-3xl font-bold leading-tight text-white sm:text-5xl">{category.name}</h1>
        {category.description ? (
          <p className="mt-2 line-clamp-2 max-w-xl text-sm leading-relaxed text-white/85 sm:mt-3 sm:line-clamp-3">
            {category.description}
          </p>
        ) : null}
        </div>
      </header>
      {children.length ? <nav aria-label={`Shop ${category.name} by type`} className="no-scrollbar mt-4 flex gap-2 overflow-x-auto pb-1">{children.map((child) => <Link key={child.id} href={`/category/${child.slug}`} className="border-line bg-raised text-ink hover:border-ink inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-xs font-semibold transition-colors">{child.name}</Link>)}</nav> : null}

      <Suspense fallback={<ListingSkeleton />}>
        <CategoryListing slug={category.slug} searchParams={searchParams} />
      </Suspense>

      {/*
        SEO copy sits BELOW the grid: it is written for crawlers and for
        shoppers who scrolled the whole page, and putting it above would push
        the products people came for off the fold.
      */}
      {category.seoIntro ? (
        <section className="border-line mt-12 border-t pt-6">
          <h2 className="text-ink text-sm font-semibold">About {category.name}</h2>
          <p className="text-muted mt-2 max-w-3xl text-pretty text-sm">{category.seoIntro}</p>
        </section>
      ) : null}
    </div>
  );
}

/** The dynamic half: everything that depends on the query string. */
async function CategoryListing({
  slug,
  searchParams,
}: {
  slug: string;
  searchParams: Promise<RawSearchParams>;
}) {
  const raw = await searchParams;
  const query = parseProductQuery(raw, { categorySlug: slug });
  const result = await listProducts(query);
  const basePath = `/category/${slug}`;

  return (
    <>
      <JsonLd
        data={itemListJsonLd(
          result.items.map((item) => ({
            name: item.title,
            url: absoluteUrl(`/product/${item.slug}`),
          })),
        )}
      />

      {/*
        The entire listing arrangement — sticky mobile bar, docked rail, applied
        chips, toolbar, grid, pagination — lives in `ListingView` and is shared
        with search, brand and store. Four copies of this layout was four
        chances for the filter drawer to go missing from one of them.
      */}
      <ListingView
        result={result}
        params={raw}
        basePath={basePath}
        sort={query.sort ?? 'popularity'}
      />
    </>
  );
}

function ListingSkeleton() {
  return (
    <div className="mt-5 flex gap-8">
      <div className="hidden w-60 shrink-0 space-y-4 lg:block" aria-hidden>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="space-y-2">
            <div className="skeleton h-4 w-24 rounded-xs" />
            <div className="skeleton h-3 w-full rounded-xs" />
            <div className="skeleton h-3 w-5/6 rounded-xs" />
          </div>
        ))}
      </div>
      <div className="min-w-0 flex-1">
        <div className="skeleton h-8 w-full rounded-sm" aria-hidden />
        <ProductGridSkeleton className="mt-5" count={15} />
      </div>
    </div>
  );
}
