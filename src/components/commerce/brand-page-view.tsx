import { ArrowDown, ArrowRight, Star } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { Breadcrumbs } from '@/components/commerce/breadcrumbs';
import { ProductCard } from '@/components/commerce/product-card';
import { Badge } from '@/components/ui/badge';
import { Picture } from '@/components/ui/picture';
import type { BrandPageSettings, BrandPageVariant } from '@/domain/page-designs/brand';
import type { Brand, Category, ProductSummary } from '@/domain/types';
import { cn } from '@/lib/cn';
import { formatRating } from '@/lib/format';

/**
 * The brand page around its listing, in each layout.
 *
 * The listing arrives as `listing`, rendered by the route inside its own
 * `<Suspense>` because it reads the query string; everything here comes from
 * the brand and cached data, so it prerenders.
 */
export function BrandPageView({
  brand,
  categories,
  similar,
  newArrivals,
  variant,
  settings,
  listing,
  banner,
}: {
  brand: Brand;
  categories: Category[];
  similar: Brand[];
  newArrivals: ProductSummary[];
  variant: BrandPageVariant;
  settings: BrandPageSettings;
  listing: React.ReactNode;
  banner?: React.ReactNode;
}) {
  const crumbs = settings.breadcrumbs ? (
    <Breadcrumbs
      items={[
        { href: '/', label: 'Home' },
        { href: '/brands', label: 'Brands' },
        { href: `/brand/${brand.slug}`, label: brand.name },
      ]}
    />
  ) : null;

  const shop =
    settings.categories && categories.length ? (
      <ShopByCategory brand={brand} categories={categories} style={settings.categoryStyle === 'tiles' ? 'tiles' : 'chips'} />
    ) : null;

  const rail =
    settings.newArrivals && newArrivals.length >= 4 ? (
      <section aria-label={settings.newArrivalsTitle || 'New in'} className="mt-10">
        <h2 className="font-display text-ink text-xl font-bold sm:text-2xl">{settings.newArrivalsTitle || 'New in'}</h2>
        <ul className="no-scrollbar mt-4 flex snap-x gap-3 overflow-x-auto pb-2 sm:gap-4">
          {newArrivals.map((product) => (
            <li key={product.id} className="w-40 shrink-0 snap-start sm:w-52">
              <ProductCard product={product} />
            </li>
          ))}
        </ul>
      </section>
    ) : null;

  const tail = settings.similarBrands && similar.length ? <SimilarBrands brands={similar} /> : null;

  if (variant === 'campaign') {
    return (
      <>
        <div className="gutter shell-max pt-5">
          {banner}
          {crumbs}
        </div>
        <CampaignHero brand={brand} settings={settings} />
        <div className="gutter shell-max pb-5">
          {shop}
          {rail}
          {listing}
          {tail}
        </div>
      </>
    );
  }

  return (
    <div className="gutter shell-max py-5">
      {banner}
      {crumbs}
      {variant === 'catalogue' ? <CatalogueHeader brand={brand} settings={settings} /> : <ClassicHeader brand={brand} settings={settings} />}
      {shop}
      {rail}
      {listing}
      {tail}
    </div>
  );
}

/* ------------------------------------------------------------ headers */

type HeaderProps = { brand: Brand; settings: BrandPageSettings };

function facts(brand: Brand): string[] {
  return [
    brand.foundedYear ? `Founded ${brand.foundedYear}` : null,
    brand.originCountry || null,
    `${brand.productCount} ${brand.productCount === 1 ? 'style' : 'styles'}`,
  ].filter((fact): fact is string => Boolean(fact));
}

function RatingChip({ brand, tone = 'plain' }: { brand: Brand; tone?: 'plain' | 'glass' }) {
  if (!(brand.averageRating > 0)) return null;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold',
        tone === 'glass' ? 'bg-white/15 text-white backdrop-blur' : 'bg-sunken text-ink',
      )}
    >
      <Star className="size-3.5 fill-current text-amber-500" aria-hidden />
      {formatRating(brand.averageRating)} average
    </span>
  );
}

function ClassicHeader({ brand, settings }: HeaderProps) {
  return (
    <header className="mt-3">
      <div className="flex items-center gap-3">
        {settings.logo ? <Picture src={brand.logoUrl} name={brand.name} sizes="48px" className="border-line size-12 shrink-0 rounded-xl border" fit="contain" /> : null}
        <h1 className="font-display text-ink text-2xl sm:text-3xl">{brand.name}</h1>
        {brand.isPremium ? <Badge tone="premium">Premium</Badge> : null}
        {settings.rating ? <RatingChip brand={brand} /> : null}
      </div>
      {settings.description && brand.description ? <p className="text-muted mt-2 max-w-2xl text-pretty text-sm">{brand.description}</p> : null}
      {settings.facts ? <p className="text-faint mt-2 text-xs">{facts(brand).join(' · ')}</p> : null}
    </header>
  );
}

/**
 * Full width, and dark enough behind the type to be read over any banner --
 * a brand's own photograph is never art-directed for our overlay.
 */
function CampaignHero({ brand, settings }: HeaderProps) {
  const image = settings.hero ? brand.bannerUrl : null;
  return (
    <header className="relative isolate mt-3 overflow-hidden bg-neutral-950 text-white">
      {image ? (
        <Image src={image} alt="" fill priority sizes="100vw" className="-z-10 object-cover opacity-80" />
      ) : (
        <div aria-hidden className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,var(--color-iris-700),transparent_60%),radial-gradient(ellipse_at_bottom_left,var(--color-sand-700),transparent_55%)]" />
      )}
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-t from-black/85 via-black/40 to-black/10" />
      <div className="gutter shell-max flex min-h-[26rem] flex-col justify-end py-10 sm:min-h-[32rem] sm:py-14">
        {settings.logo ? (
          <Picture src={brand.logoUrl} name={brand.name} sizes="80px" className="size-16 rounded-2xl bg-white p-1.5 shadow-lg sm:size-20" fit="contain" />
        ) : null}
        {settings.facts ? (
          <p className="mt-5 text-xs font-semibold uppercase tracking-[0.25em] text-white/75">{facts(brand).join(' · ')}</p>
        ) : null}
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="font-display text-5xl font-bold leading-[0.95] tracking-tight text-white sm:text-7xl">{brand.name}</h1>
          {brand.isPremium ? <Badge tone="premium">Premium</Badge> : null}
        </div>
        {settings.description && brand.description ? (
          <p className="mt-4 line-clamp-3 max-w-xl text-pretty text-sm leading-relaxed text-white/85 sm:text-base">{brand.description}</p>
        ) : null}
        <div className="mt-6 flex flex-wrap items-center gap-3">
          <a
            href="#listing"
            className="inline-flex min-h-11 items-center gap-2 rounded-full bg-white px-5 text-sm font-semibold text-neutral-900 transition-transform hover:-translate-y-0.5"
          >
            Shop the collection <ArrowDown className="size-4" aria-hidden />
          </a>
          {settings.rating ? <RatingChip brand={brand} tone="glass" /> : null}
        </div>
      </div>
    </header>
  );
}

/** Slim: one row of who, then straight to the products. */
function CatalogueHeader({ brand, settings }: HeaderProps) {
  return (
    <header className="border-line mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 border-b pb-4">
      {settings.logo ? <Picture src={brand.logoUrl} name={brand.name} sizes="56px" className="border-line size-14 shrink-0 rounded-xl border" fit="contain" /> : null}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="font-display text-ink text-xl font-bold sm:text-2xl">{brand.name}</h1>
          {brand.isPremium ? <Badge tone="premium">Premium</Badge> : null}
        </div>
        {settings.facts ? <p className="text-muted mt-0.5 text-xs">{facts(brand).join(' · ')}</p> : null}
      </div>
      {settings.rating ? <RatingChip brand={brand} /> : null}
      {settings.description && brand.description ? (
        <details className="group w-full">
          <summary className="text-accent-ink inline-flex min-h-10 cursor-pointer list-none items-center gap-1 text-xs font-semibold">
            About {brand.name}
            <ArrowRight className="size-3.5 transition-transform group-open:rotate-90" aria-hidden />
          </summary>
          <p className="text-muted max-w-3xl text-pretty text-sm">{brand.description}</p>
        </details>
      ) : null}
    </header>
  );
}

/* ------------------------------------------------------- discovery */

/**
 * Each category the brand sells in opens THAT category filtered to this
 * brand: the category page carries the right facets for it (sizes for
 * shoes, not for bags), which a brand-wide listing cannot.
 */
function ShopByCategory({ brand, categories, style }: { brand: Brand; categories: Category[]; style: 'chips' | 'tiles' }) {
  const href = (category: Category) => `/category/${category.slug}?brand=${encodeURIComponent(brand.slug)}`;
  if (style === 'chips') {
    return (
      <nav aria-label={`Shop ${brand.name} by category`} className="no-scrollbar mt-4 flex gap-2 overflow-x-auto pb-1">
        {categories.map((category) => (
          <Link
            key={category.id}
            href={href(category)}
            className="border-line bg-raised text-ink hover:border-ink inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-xs font-semibold transition-colors"
          >
            {category.name}
          </Link>
        ))}
      </nav>
    );
  }
  return (
    <nav aria-label={`Shop ${brand.name} by category`} className="mt-8">
      <h2 className="font-display text-ink text-xl font-bold sm:text-2xl">Shop by category</h2>
      <ul className="no-scrollbar mt-4 flex snap-x gap-3 overflow-x-auto pb-1">
        {categories.map((category) => (
          <li key={category.id} className="w-32 shrink-0 snap-start sm:w-40">
            <Link href={href(category)} className="group block">
              <span className="bg-sunken relative block aspect-4/5 overflow-hidden rounded-2xl">
                <Image src={category.imageUrl} alt="" fill sizes="10rem" className="object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none" />
              </span>
              <span className="text-ink mt-2 line-clamp-1 block text-center text-sm font-semibold">{category.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function SimilarBrands({ brands }: { brands: Brand[] }) {
  return (
    <section aria-labelledby="similar-brands" className="border-line mt-14 border-t pt-8">
      <h2 id="similar-brands" className="font-display text-ink text-xl font-bold sm:text-2xl">
        You might also like
      </h2>
      <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {brands.map((other) => (
          <li key={other.id}>
            <Link href={`/brand/${other.slug}`} className="border-line bg-raised hover:border-accent-line flex h-full flex-col items-center rounded-2xl border p-4 text-center transition-colors">
              <Picture src={other.logoUrl} name={other.name} sizes="56px" className="size-14 rounded-xl" fit="contain" />
              <span className="text-ink mt-2 line-clamp-1 text-sm font-semibold">{other.name}</span>
              <span className="text-faint text-2xs">{other.productCount} styles</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
