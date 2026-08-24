import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, permanentRedirect } from 'next/navigation';
import { Suspense } from 'react';

import { Breadcrumbs } from '@/components/commerce/breadcrumbs';
import { ProductCard } from '@/components/commerce/product-card';
import { RatingStars } from '@/components/commerce/rating-stars';
import { ProductViewer } from '@/components/product/product-viewer';
import { ReviewSummary } from '@/components/product/review-summary';
import { JsonLd } from '@/components/seo/json-ld';
import { ProductRailSkeleton } from '@/components/skeletons/product-card-skeleton';
import { Badge } from '@/components/ui/badge';
import { absoluteUrl } from '@/config/site';
import { COLOR_BY_VALUE } from '@/domain/attributes';
import { breadcrumbListJsonLd, productJsonLd } from '@/lib/seo/structured-data';
import {
  getBrandById,
  getCategoryAncestors,
  getProductById,
  getProductBySlug,
  getSellerById,
  getTopProductSlugs,
} from '@/server/services/catalog';
import { getRelatedProducts } from '@/server/services/listing';
import { getFitSummary, getProductReviews } from '@/server/services/reviews';

/**
 * Product detail.
 *
 * The commercial heart of the shop, and the page where the caching model earns
 * its keep. The shell — imagery, copy, price, specifications — is prerendered
 * and tagged `product:<id>`, so a price change expires exactly this page and
 * the grids it appears in, nothing else. Reviews and recommendations stream in
 * behind their own boundaries so neither can delay the fold.
 */

interface PageProps {
  params: Promise<{ slug: string }>;
}

/**
 * Prerender the best-selling slice at build time. The long tail renders on
 * first request and is cached from then on, which keeps builds short without
 * costing the pages people actually visit.
 */
export async function generateStaticParams() {
  const slugs = await getTopProductSlugs(120);
  return slugs.map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return {};

  const url = absoluteUrl(`/product/${product.slug}`);

  return {
    title: product.metaTitle ?? product.title,
    description: product.metaDescription ?? product.description.slice(0, 155),
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      title: product.title,
      description: product.metaDescription ?? product.description.slice(0, 200),
      url,
      images: product.media.slice(0, 3).map((m) => ({
        url: absoluteUrl(m.url),
        width: m.width,
        height: m.height,
        alt: m.alt,
      })),
    },
  };
}

export default async function ProductPage({ params }: PageProps) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);

  if (!product) notFound();

  // Resolved via `slugHistory`: the canonical URL moved, so redirect rather
  // than serving the same product on two addresses.
  if (product.slug !== slug) permanentRedirect(`/product/${product.slug}`);

  const [ancestors, brand, seller] = await Promise.all([
    getCategoryAncestors(product.categoryPath.at(-1) ?? ''),
    getBrandById(product.brandId),
    getSellerById(product.sellerId),
  ]);

  const url = absoluteUrl(`/product/${product.slug}`);

  const colorOptions = product.colorOptions.map((value) => {
    const def = COLOR_BY_VALUE.get(value);
    const variant = product.variants.find((v) => v.color === value);
    return {
      value,
      label: def?.label ?? variant?.colorLabel ?? value,
      hex: def?.hex ?? variant?.colorHex ?? '#8F2C5B',
    };
  });

  return (
    <div className="gutter shell-max py-5">
      <Breadcrumbs
        items={[
          { href: '/', label: 'Home' },
          ...ancestors.map((c) => ({ href: `/category/${c.slug}`, label: c.name })),
          { href: `/product/${product.slug}`, label: product.title },
        ]}
      />

      <JsonLd
        data={breadcrumbListJsonLd([
          { name: 'Home', url: absoluteUrl('/') },
          ...ancestors.map((c) => ({ name: c.name, url: absoluteUrl(`/category/${c.slug}`) })),
          { name: product.title, url },
        ])}
      />

      <div className="mt-5">
        <ProductViewer
          productId={product.id}
          title={product.title}
          variants={product.variants}
          media={product.media}
          sizeOptions={product.sizeOptions}
          colorOptions={colorOptions}
          header={
            <div className="mb-7">
              {brand ? (
                <Link
                  href={`/brand/${brand.slug}`}
                  className="text-faint hover:text-ink text-2xs font-medium uppercase tracking-[0.16em] transition-colors"
                >
                  {brand.name}
                </Link>
              ) : null}

              <h1 className="font-display text-ink mt-2 text-2xl leading-tight sm:text-3xl">
                {product.title}
              </h1>

              <div className="mt-3 flex flex-wrap items-center gap-3">
                {product.rating.count > 0 ? (
                  <a href="#reviews" className="inline-flex items-center gap-2">
                    <RatingStars
                      rating={product.rating.average}
                      count={product.rating.count}
                      size="md"
                    />
                    <span className="text-muted text-xs underline-offset-4 hover:underline">
                      Read reviews
                    </span>
                  </a>
                ) : null}
                {brand?.isPremium ? <Badge tone="brass" size="sm">Premium</Badge> : null}
              </div>
            </div>
          }
          footer={
            <div className="mt-8 space-y-5">
              {/* On a marketplace, who you buy from is part of the offer. */}
              {seller ? (
                <div className="border-line rounded-lg border p-4">
                  <p className="text-faint text-2xs uppercase tracking-[0.14em]">Sold by</p>
                  <Link
                    href={`/store/${seller.slug}`}
                    className="text-ink mt-1 block text-sm font-semibold hover:underline"
                  >
                    {seller.displayName}
                  </Link>
                  <p className="text-muted mt-1 text-xs">
                    {seller.rating.average}★ · {seller.rating.onTimeDispatchRate}% dispatched on
                    time
                  </p>
                  <p className="text-muted mt-2.5 text-xs">{seller.policies.shippingNote}</p>
                </div>
              ) : null}

              <dl className="border-line space-y-4 border-t pt-5 text-sm">
                <div>
                  <dt className="text-ink font-semibold">Returns</dt>
                  <dd className="text-muted mt-1">
                    {product.returnable
                      ? `${product.returnWindowDays}-day returns${product.exchangeable ? ' and exchanges' : ''} on unworn items with tags intact.`
                      : 'This item cannot be returned once delivered.'}
                  </dd>
                </div>
                <div>
                  <dt className="text-ink font-semibold">Highlights</dt>
                  <dd className="text-muted mt-1.5">
                    <ul className="list-disc space-y-1.5 pl-4">
                      {product.highlights.map((highlight) => (
                        <li key={highlight}>{highlight}</li>
                      ))}
                    </ul>
                  </dd>
                </div>
              </dl>
            </div>
          }
        />
      </div>

      {/* -------------------------------------------------------- details */}

      <section className="mt-14 grid gap-10 lg:grid-cols-2">
        <div>
          <h2 className="font-display text-ink text-lg">Product details</h2>
          <p className="text-muted mt-3 whitespace-pre-line text-pretty text-sm">
            {product.description}
          </p>

          {product.modelNote ? (
            <p className="text-faint mt-3 text-xs">{product.modelNote}</p>
          ) : null}

          <h3 className="text-ink mt-6 text-sm font-semibold">Care</h3>
          <ul className="text-muted mt-2 list-disc space-y-1 pl-4 text-sm">
            {product.careInstructions.map((instruction) => (
              <li key={instruction}>{instruction}</li>
            ))}
          </ul>
        </div>

        <div>
          <h2 className="font-display text-ink text-lg">Specifications</h2>
          <dl className="border-line mt-3 divide-y divide-[--border-subtle] border-y text-sm">
            {product.specifications.map((spec) => (
              <div key={spec.label} className="grid grid-cols-3 gap-3 py-2.5">
                <dt className="text-muted col-span-1">{spec.label}</dt>
                <dd className="text-ink col-span-2">{spec.value}</dd>
              </div>
            ))}
            <div className="grid grid-cols-3 gap-3 py-2.5">
              <dt className="text-muted col-span-1">Net quantity</dt>
              <dd className="text-ink col-span-2">{product.netQuantity}</dd>
            </div>
            <div className="grid grid-cols-3 gap-3 py-2.5">
              <dt className="text-muted col-span-1">Marketed by</dt>
              <dd className="text-ink col-span-2">
                {product.manufacturerName}, {product.manufacturerAddress}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      {/* -------------------------------------------------------- reviews */}

      <section id="reviews" className="mt-14 scroll-mt-28">
        <h2 className="font-display text-ink text-lg">Ratings and reviews</h2>
        <Suspense fallback={<ReviewsSkeleton />}>
          <Reviews productId={product.id} />
        </Suspense>
      </section>

      {/* -------------------------------------------------------- related */}

      <section className="mt-14">
        <h2 className="font-display text-ink text-lg">You might also like</h2>
        <div className="mt-4">
          <Suspense fallback={<ProductRailSkeleton />}>
            <Related productId={product.id} slug={product.slug} />
          </Suspense>
        </div>
      </section>

      {/*
        Product structured data is emitted last so it can include the review
        nodes; it still lands in the initial HTML.
      */}
      <Suspense fallback={null}>
        <ProductStructuredData productId={product.id} url={url} brandName={brand?.name ?? ''} />
      </Suspense>
    </div>
  );
}

/* ------------------------------------------------------------ streamed */

async function Reviews({ productId }: { productId: string }) {
  const [page, fit] = await Promise.all([
    getProductReviews(productId, { sort: 'helpful', limit: 6 }),
    getFitSummary(productId),
  ]);

  return <ReviewSummary reviews={page.items} total={page.total} fit={fit} />;
}

async function Related({ productId, slug }: { productId: string; slug: string }) {
  const product = await getProductBySlug(slug);
  if (!product) return null;

  const related = await getRelatedProducts(product);
  const items = related.filter((item) => item.id !== productId);

  if (items.length === 0) {
    return <p className="text-muted text-sm">Nothing similar in this category yet.</p>;
  }

  return (
    <ul className="scrollbar-none flex snap-x gap-3 overflow-x-auto pb-1">
      {items.map((item) => (
        <li key={item.id} className="w-[46%] shrink-0 snap-start sm:w-[30%] lg:w-[22%] xl:w-[16.5%]">
          <ProductCard product={item} />
        </li>
      ))}
    </ul>
  );
}

async function ProductStructuredData({
  productId,
  url,
  brandName,
}: {
  productId: string;
  url: string;
  brandName: string;
}) {
  const product = await getProductById(productId);
  if (!product) return null;

  const [seller, reviews] = await Promise.all([
    getSellerById(product.sellerId),
    getProductReviews(productId, { sort: 'helpful', limit: 5 }),
  ]);

  return (
    <JsonLd data={productJsonLd({ product, brandName, seller, reviews: reviews.items, url })} />
  );
}

function ReviewsSkeleton() {
  return (
    <div className="mt-4 space-y-4" aria-hidden>
      <div className="skeleton h-20 w-full max-w-md rounded-md" />
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} className="space-y-2">
          <div className="skeleton h-3.5 w-32 rounded-xs" />
          <div className="skeleton h-3 w-full rounded-xs" />
          <div className="skeleton h-3 w-4/5 rounded-xs" />
        </div>
      ))}
    </div>
  );
}
