import { BadgeCheck, MessageCircle, Play, Store } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';

import { Breadcrumbs } from '@/components/commerce/breadcrumbs';
import { ProductCard } from '@/components/commerce/product-card';
import { RatingStars } from '@/components/commerce/rating-stars';
import { ShareMenu } from '@/components/commerce/share-menu';
import { ProductViewer } from '@/components/product/product-viewer';
import { ReviewSummary } from '@/components/product/review-summary';
import { JsonLd } from '@/components/seo/json-ld';
import { ProductRailSkeleton } from '@/components/skeletons/product-card-skeleton';
import { StoreReels } from '@/components/store/store-reels';
import { Badge } from '@/components/ui/badge';
import { Picture } from '@/components/ui/picture';
import { absoluteUrl } from '@/config/site';
import { COLOR_BY_VALUE } from '@/domain/attributes';
import type { ProductPageSettings, ProductPageVariant } from '@/domain/page-designs/product';
import { storePageDesign } from '@/domain/page-designs/store';
import type { Brand, Category, Product, Seller } from '@/domain/types';
import { parseProductQuery } from '@/lib/product-query';
import { breadcrumbListJsonLd, productJsonLd } from '@/lib/seo/structured-data';
import { storeStats, whatsappLink } from '@/lib/store-stats';
import { getProductById, getProductBySlug, getSellerById } from '@/server/services/catalog';
import { getRelatedProducts, listProducts } from '@/server/services/listing';
import { getFitSummary, getProductReviews } from '@/server/services/reviews';

/**
 * The product page, in whichever layout is live.
 *
 * Shared by `/product/[slug]` and the staff-only preview. The buy box is the
 * same `ProductViewer` in every layout; what changes is the arrangement
 * around it and which pieces show. Classic, with every switch on, is the page
 * exactly as it shipped.
 */
export function ProductPageView({
  product,
  brand,
  seller,
  ancestors,
  variant,
  settings,
  banner,
}: {
  product: Product;
  brand: Brand | null;
  seller: Seller | null;
  ancestors: Category[];
  variant: ProductPageVariant;
  settings: ProductPageSettings;
  /** Above everything; the preview uses it to say what it is. */
  banner?: React.ReactNode;
}) {
  const url = absoluteUrl(`/product/${product.slug}`);
  const hasVideo = product.media.some((asset) => asset.kind === 'VIDEO');

  const colorOptions = product.colorOptions.map((value) => {
    const def = COLOR_BY_VALUE.get(value);
    const match = product.variants.find((v) => v.color === value);
    return { value, label: def?.label ?? match?.colorLabel ?? value, hex: def?.hex ?? match?.colorHex ?? '#8F2C5B' };
  });

  const chat = settings.whatsapp && seller ? whatsappLink(seller.supportPhone, seller.displayName) : null;

  const header = (
    <div className="mb-5">
      {brand ? (
        <Link
          href={`/brand/${brand.slug}`}
          className="text-faint hover:text-ink text-2xs font-medium uppercase tracking-[0.16em] transition-colors"
        >
          {brand.name}
        </Link>
      ) : null}

      <h1
        className={
          variant === 'lookbook'
            ? 'font-display text-ink mt-2 text-3xl leading-tight sm:text-4xl'
            : 'font-display text-ink mt-2 text-2xl leading-tight sm:text-3xl'
        }
      >
        {product.title}
      </h1>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        {product.rating.count > 0 ? (
          <a href="#reviews" className="inline-flex items-center gap-2">
            <RatingStars rating={product.rating.average} count={product.rating.count} size="md" />
            <span className="text-muted text-xs underline-offset-4 hover:underline">Read reviews</span>
          </a>
        ) : null}
        {brand?.isPremium ? (
          <Badge tone="premium" size="sm">
            Premium
          </Badge>
        ) : null}
      </div>
      {settings.demoButton && hasVideo ? (
        <Link
          href={`/demo/${product.slug}`}
          className="border-accent text-accent-ink hover:bg-accent-soft mt-4 inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-xs font-semibold transition-colors"
        >
          <Play className="size-4 fill-current" />
          Watch the product demo
        </Link>
      ) : null}
    </div>
  );

  const footer = (
    <div className="mt-8 space-y-5">
      {/* On a marketplace, who you buy from is part of the offer. The Social
          layout puts the seller at the top of the page instead. */}
      {settings.sellerCard && seller && variant !== 'social' ? (
        <div className="border-line rounded-lg border p-4">
          <p className="text-faint text-2xs uppercase tracking-[0.14em]">Sold by</p>
          <Link href={`/store/${seller.slug}`} className="text-ink mt-1 block text-sm font-semibold hover:underline">
            {seller.displayName}
          </Link>
          <p className="text-muted mt-1 text-xs">
            {seller.rating.average}★ · {seller.rating.onTimeDispatchRate}% dispatched on time
          </p>
          <p className="text-muted mt-2.5 text-xs">{seller.policies.shippingNote}</p>
          {chat ? (
            <a
              href={chat}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-3 inline-flex min-h-10 items-center gap-2 rounded-full bg-[#1f9d55] px-4 text-xs font-semibold text-white"
            >
              <MessageCircle className="size-4" aria-hidden />
              Ask the store on WhatsApp
            </a>
          ) : null}
        </div>
      ) : null}

      {settings.returnsInfo || (settings.highlights && variant !== 'lookbook') ? (
        <dl className="border-line space-y-4 border-t pt-5 text-sm">
          {settings.returnsInfo ? (
            <div>
              <dt className="text-ink font-semibold">Returns</dt>
              <dd className="text-muted mt-1">
                {product.returnable
                  ? `${product.returnWindowDays}-day returns${product.exchangeable ? ' and exchanges' : ''} on unworn items with tags intact.`
                  : 'This item cannot be returned once delivered.'}
              </dd>
            </div>
          ) : null}
          {settings.highlights && variant !== 'lookbook' ? (
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
          ) : null}
        </dl>
      ) : null}
    </div>
  );

  const viewer = (
    <ProductViewer
      productId={product.id}
      title={product.title}
      variants={product.variants}
      media={product.media}
      sizeOptions={product.sizeOptions}
      sizeSystem={product.sizeSystem}
      colorOptions={colorOptions}
      header={header}
      footer={footer}
      layout={variant}
      options={{
        zoom: settings.zoom,
        sizeGuide: settings.sizeGuide,
        seeLive: settings.seeLive,
        wishlist: settings.wishlist,
        stickyBar: settings.stickyBar,
        urgency: settings.urgency,
        ctaLabel: settings.ctaLabel || 'Add to bag',
      }}
      interludes={variant === 'lookbook' && settings.highlights ? product.highlights.slice(0, 3) : []}
    />
  );

  const details = settings.details ? <Details product={product} /> : null;
  const specifications = settings.specifications ? <Specifications product={product} /> : null;

  const reviews = settings.reviews ? (
    <section id="reviews" className="mt-14 scroll-mt-28">
      <h2 className="font-display text-ink text-lg">Ratings and reviews</h2>
      <Suspense fallback={<ReviewsSkeleton />}>
        <Reviews productId={product.id} photosFirst={settings.photoReviewsFirst} />
      </Suspense>
    </section>
  ) : null;

  const storeRail =
    settings.storeRail && seller ? (
      <section className="mt-14">
        <h2 className="font-display text-ink text-lg">{settings.storeRailTitle || 'More from this store'}</h2>
        <div className="mt-4">
          <Suspense fallback={<ProductRailSkeleton />}>
            <StoreRail sellerSlug={seller.slug} productId={product.id} asReels={variant === 'social'} />
          </Suspense>
        </div>
      </section>
    ) : null;

  const related = settings.related ? (
    <section className="mt-14">
      <h2 className="font-display text-ink text-lg">{settings.relatedTitle || 'You might also like'}</h2>
      <div className="mt-4">
        <Suspense fallback={<ProductRailSkeleton />}>
          <Related productId={product.id} slug={product.slug} />
        </Suspense>
      </div>
    </section>
  ) : null;

  return (
    <div className="gutter shell-max min-w-0 py-3 pb-8 sm:py-5 lg:pb-8">
      {banner}

      {settings.breadcrumbs || settings.share ? (
        <div className="flex min-w-0 items-center gap-3">
          <div className="min-w-0 flex-1">
            {settings.breadcrumbs ? (
              <Breadcrumbs
                items={[
                  { href: '/', label: 'Home' },
                  ...ancestors.map((c) => ({ href: `/category/${c.slug}`, label: c.name })),
                  { href: `/product/${product.slug}`, label: product.title },
                ]}
              />
            ) : null}
          </div>
          {settings.share ? (
            <ShareMenu title={product.title} path={`/product/${product.slug}`} demoPath={`/demo/${product.slug}`} />
          ) : null}
        </div>
      ) : null}

      {/* Structured data whatever the layout: search engines read it, shoppers do not. */}
      <JsonLd
        data={breadcrumbListJsonLd([
          { name: 'Home', url: absoluteUrl('/') },
          ...ancestors.map((c) => ({ name: c.name, url: absoluteUrl(`/category/${c.slug}`) })),
          { name: product.title, url },
        ])}
      />

      {variant === 'social' && seller && settings.sellerCard ? <SellerStrip seller={seller} chat={chat} /> : null}

      <div className="mt-5">{viewer}</div>

      {variant === 'classic' ? (
        <>
          {details || specifications ? (
            <section className="mt-14 grid gap-10 lg:grid-cols-2">
              {details}
              {specifications}
            </section>
          ) : null}
          {reviews}
          {storeRail}
          {related}
        </>
      ) : variant === 'lookbook' ? (
        <>
          {storeRail}
          {details || specifications ? (
            <section className="border-line mt-16 grid gap-12 border-t pt-12 lg:grid-cols-2">
              {details}
              {specifications}
            </section>
          ) : null}
          {reviews}
          {related}
        </>
      ) : (
        <>
          {reviews}
          {storeRail}
          {details || specifications ? (
            <section className="mt-14 space-y-3">
              {details ? (
                <details className="border-line bg-raised group rounded-2xl border p-5">
                  <summary className="text-ink cursor-pointer text-sm font-semibold">Details and care</summary>
                  <div className="mt-2">{details}</div>
                </details>
              ) : null}
              {specifications ? (
                <details className="border-line bg-raised group rounded-2xl border p-5">
                  <summary className="text-ink cursor-pointer text-sm font-semibold">Specifications</summary>
                  <div className="mt-2">{specifications}</div>
                </details>
              ) : null}
            </section>
          ) : null}
          {related}
        </>
      )}

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

/* ------------------------------------------------------------- sections */

function Details({ product }: { product: Product }) {
  return (
    <div>
      <h2 className="font-display text-ink text-lg">Product details</h2>
      <p className="text-muted mt-3 whitespace-pre-line text-pretty text-sm">{product.description}</p>
      {product.modelNote ? <p className="text-faint mt-3 text-xs">{product.modelNote}</p> : null}
      <h3 className="text-ink mt-6 text-sm font-semibold">Care</h3>
      <ul className="text-muted mt-2 list-disc space-y-1 pl-4 text-sm">
        {product.careInstructions.map((instruction) => (
          <li key={instruction}>{instruction}</li>
        ))}
      </ul>
    </div>
  );
}

function Specifications({ product }: { product: Product }) {
  return (
    <div>
      <h2 className="font-display text-ink text-lg">Specifications</h2>
      <dl className="border-line mt-3 divide-y divide-(--border-subtle) border-y text-sm">
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
  );
}

/**
 * Social: the seller first. For a shop that sells on Instagram, who is selling
 * is half the reason to buy -- so their face, their record and a way to talk
 * to them sit above the product, not under it.
 */
function SellerStrip({ seller, chat }: { seller: Seller; chat: string | null }) {
  const stats = storeStats(seller, storePageDesign.defaults.classic);
  return (
    <div className="border-line bg-raised mt-4 flex flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl border p-3 sm:p-4">
      <Link href={`/store/${seller.slug}`} className="flex min-w-0 items-center gap-3">
        <span className="shrink-0 rounded-full bg-[conic-gradient(from_210deg,#f59e0b,#ef4444,#d946ef,#8b5cf6,#f59e0b)] p-[2px]">
          <span className="bg-canvas block rounded-full p-[2px]">
            <Picture src={seller.logoUrl} name={seller.displayName} sizes="48px" fit="contain" className="size-11 rounded-full bg-white" />
          </span>
        </span>
        <span className="min-w-0">
          <span className="text-ink flex items-center gap-1 text-sm font-semibold">
            <span className="truncate">{seller.displayName}</span>
            {seller.kyc.verifiedAt ? <BadgeCheck className="text-info-600 size-4 shrink-0" aria-label="Verified seller" /> : null}
          </span>
          <span className="text-muted block text-xs">{seller.tagline ?? 'Visit the store'}</span>
        </span>
      </Link>

      {stats.length ? (
        <ul className="flex flex-1 flex-wrap gap-x-5 gap-y-1">
          {stats.map((stat) => (
            <li key={stat.key} className="min-w-0">
              <span className="text-ink block text-sm font-bold leading-tight">{stat.value}</span>
              <span className="text-muted block text-2xs">{stat.label}</span>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex w-full gap-2 sm:w-auto">
        {chat ? (
          <a
            href={chat}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-full bg-[#1f9d55] px-4 text-xs font-semibold text-white sm:flex-none"
          >
            <MessageCircle className="size-4" aria-hidden />
            WhatsApp
          </a>
        ) : null}
        <Link
          href={`/store/${seller.slug}`}
          className="border-line-control text-ink hover:bg-sunken inline-flex min-h-10 flex-1 items-center justify-center gap-2 rounded-full border px-4 text-xs font-semibold sm:flex-none"
        >
          <Store className="size-4" aria-hidden />
          Visit store
        </Link>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------ streamed */

async function Reviews({ productId, photosFirst }: { productId: string; photosFirst: boolean }) {
  const [page, fit] = await Promise.all([
    getProductReviews(productId, { sort: 'helpful', limit: 6 }),
    getFitSummary(productId),
  ]);

  const items = photosFirst
    ? [...page.items].sort((a, b) => Number(b.images.length > 0) - Number(a.images.length > 0))
    : page.items;
  const photos = photosFirst ? items.flatMap((review) => review.images).slice(0, 8) : [];

  return (
    <>
      {photos.length ? (
        <ul className="mt-4 grid grid-cols-4 gap-1.5 sm:grid-cols-8" aria-label="Customer photos">
          {photos.map((src, index) => (
            <li key={`${src}-${index}`} className="bg-sunken relative aspect-square overflow-hidden rounded-lg">
              <Picture src={src} name="Customer photo" sizes="12vw" className="absolute inset-0" />
            </li>
          ))}
        </ul>
      ) : null}
      <ReviewSummary reviews={items} total={page.total} fit={fit} />
    </>
  );
}

async function StoreRail({ sellerSlug, productId, asReels }: { sellerSlug: string; productId: string; asReels: boolean }) {
  const result = await listProducts(parseProductQuery({}, { sellerSlug }));
  const items = result.items.filter((item) => item.id !== productId).slice(0, asReels ? 10 : 12);
  if (items.length === 0) return <p className="text-muted text-sm">Nothing else from this store yet.</p>;

  if (asReels) return <StoreReels products={items} density="roomy" />;

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

async function ProductStructuredData({ productId, url, brandName }: { productId: string; url: string; brandName: string }) {
  const product = await getProductById(productId);
  if (!product) return null;

  const [seller, reviews] = await Promise.all([
    getSellerById(product.sellerId),
    getProductReviews(productId, { sort: 'helpful', limit: 5 }),
  ]);

  return <JsonLd data={productJsonLd({ product, brandName, seller, reviews: reviews.items, url })} />;
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
