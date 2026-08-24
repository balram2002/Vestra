import { ArrowRight, RotateCcw, ShieldCheck, Truck } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { ProductCard } from '@/components/commerce/product-card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import type { Banner, Category, HomeSection, ProductSummary, Seller } from '@/domain/types';
import { formatCompactNumber } from '@/lib/format';

/**
 * Homepage section renderers.
 *
 * One component per `HomeSectionKind`. The page maps `kind` to a renderer and
 * passes the section's own `config`; no component here knows where it sits on
 * the page or what comes before it, which is what makes the CMS ordering real
 * rather than cosmetic.
 */

/* ------------------------------------------------------------------ hero */

export function HeroCarousel({ banners }: { banners: Banner[] }) {
  const [lead, ...rest] = banners;
  if (!lead) return null;

  return (
    <section className="gutter shell-max pt-4" aria-label="Featured">
      <div className="grid gap-3 lg:grid-cols-3">
        {/*
          The first banner is the LCP element on the homepage, so it is
          `priority` and never lazy. Everything else on this page must not be.
        */}
        <HeroPanel banner={lead} priority className="lg:col-span-2" size="lg" />

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          {rest.slice(0, 2).map((banner) => (
            <HeroPanel key={banner.id} banner={banner} size="sm" />
          ))}
        </div>
      </div>
    </section>
  );
}

function HeroPanel({
  banner,
  priority = false,
  size,
  className,
}: {
  banner: Banner;
  priority?: boolean;
  size: 'lg' | 'sm';
  className?: string;
}) {
  const dark = banner.theme === 'dark';

  return (
    <Link
      href={banner.href}
      className={`group relative isolate flex overflow-hidden rounded-lg ${
        size === 'lg' ? 'aspect-[16/10] lg:aspect-[16/9]' : 'aspect-[16/9] lg:aspect-[16/7]'
      } ${className ?? ''}`}
    >
      <Image
        src={banner.imageUrl}
        alt={banner.alt}
        fill
        priority={priority}
        sizes={size === 'lg' ? '(max-width: 64rem) 100vw, 62vw' : '(max-width: 64rem) 50vw, 31vw'}
        className="object-cover transition-transform duration-500 motion-safe:group-hover:scale-[1.03]"
      />

      {/* A scrim, not a flat overlay: keeps the image legible while guaranteeing
          text contrast at the bottom edge where the copy sits. */}
      <div
        aria-hidden
        className={`absolute inset-0 ${
          dark
            ? 'bg-gradient-to-t from-black/75 via-black/25 to-transparent'
            : 'bg-gradient-to-t from-white/85 via-white/40 to-transparent'
        }`}
      />

      <div className="relative mt-auto p-5 sm:p-7">
        <h2
          className={`font-display max-w-md text-balance ${size === 'lg' ? 'text-2xl sm:text-4xl' : 'text-xl sm:text-2xl'} ${
            dark ? 'text-white' : 'text-bone-900'
          }`}
        >
          {banner.headline}
        </h2>

        {banner.subheadline ? (
          <p
            className={`mt-1.5 max-w-sm text-pretty text-sm ${
              dark ? 'text-white/85' : 'text-bone-700'
            }`}
          >
            {banner.subheadline}
          </p>
        ) : null}

        {banner.ctaLabel ? (
          <span
            className={`mt-3 inline-flex items-center gap-1.5 text-sm font-medium ${
              dark ? 'text-white' : 'text-bone-900'
            }`}
          >
            {banner.ctaLabel}
            <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
          </span>
        ) : null}
      </div>
    </Link>
  );
}

/* -------------------------------------------------------------- category */

export function CategoryStrip({
  section,
  categories,
}: {
  section: HomeSection;
  categories: Category[];
}) {
  if (categories.length === 0) return null;

  return (
    <Section title={section.title} subtitle={section.subtitle} href={section.href}>
      {/*
        Scrolls horizontally on small screens with snap points rather than
        wrapping into a tall grid: on a phone, twelve category tiles stacked
        two-wide push everything else below the fold.
      */}
      <ul className="scrollbar-none -mx-1 flex snap-x snap-mandatory gap-3 overflow-x-auto px-1 pb-1 sm:grid sm:grid-cols-4 sm:overflow-visible lg:grid-cols-6">
        {categories.map((category) => (
          <li key={category.id} className="w-28 shrink-0 snap-start sm:w-auto">
            <Link href={`/category/${category.slug}`} className="group block">
              <div className="bg-sunken relative aspect-square overflow-hidden rounded-full">
                <Image
                  src={category.imageUrl}
                  alt=""
                  fill
                  loading="lazy"
                  sizes="(max-width: 40rem) 7rem, 12rem"
                  className="object-cover transition-transform duration-300 motion-safe:group-hover:scale-105"
                />
              </div>
              <p className="text-ink group-hover:text-accent-ink mt-2 text-center text-xs font-medium transition-colors">
                {category.name}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/* ------------------------------------------------------------------ rail */

export function ProductRail({
  section,
  products,
}: {
  section: HomeSection;
  products: ProductSummary[];
}) {
  if (products.length === 0) return null;

  return (
    <Section title={section.title} subtitle={section.subtitle} href={section.href}>
      <ul className="scrollbar-none -mx-1 flex snap-x gap-3 overflow-x-auto px-1 pb-1">
        {products.map((product) => (
          <li
            key={product.id}
            className="w-[46%] shrink-0 snap-start sm:w-[30%] lg:w-[22%] xl:w-[16.5%]"
          >
            <ProductCard product={product} />
          </li>
        ))}
      </ul>
    </Section>
  );
}

/* ------------------------------------------------------------ banner grid */

export function BannerGrid({ banners }: { banners: Banner[] }) {
  if (banners.length === 0) return null;

  return (
    <section className="gutter shell-max py-8">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {banners.map((banner) => (
          <Link
            key={banner.id}
            href={banner.href}
            className="group relative aspect-[4/5] overflow-hidden rounded-lg sm:aspect-[4/3]"
          >
            <Image
              src={banner.imageUrl}
              alt={banner.alt}
              fill
              loading="lazy"
              sizes="(max-width: 40rem) 100vw, (max-width: 64rem) 50vw, 24vw"
              className="object-cover transition-transform duration-500 motion-safe:group-hover:scale-[1.04]"
            />
            <div
              aria-hidden
              className={`absolute inset-0 ${
                banner.theme === 'dark'
                  ? 'bg-gradient-to-t from-black/70 to-transparent'
                  : 'bg-gradient-to-t from-white/80 to-transparent'
              }`}
            />
            <div className="relative mt-auto flex h-full flex-col justify-end p-4">
              <h3
                className={`font-display text-lg text-balance ${
                  banner.theme === 'dark' ? 'text-white' : 'text-bone-900'
                }`}
              >
                {banner.headline}
              </h3>
              {banner.subheadline ? (
                <p
                  className={`mt-1 text-xs ${
                    banner.theme === 'dark' ? 'text-white/80' : 'text-bone-700'
                  }`}
                >
                  {banner.subheadline}
                </p>
              ) : null}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}

/* ----------------------------------------------------------- brand strip */

export function BrandStrip({
  section,
  brands,
}: {
  section: HomeSection;
  brands: Array<{ id: string; slug: string; name: string; isPremium: boolean; productCount: number }>;
}) {
  if (brands.length === 0) return null;

  return (
    <Section title={section.title} subtitle={section.subtitle} href={section.href}>
      <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {brands.map((brand) => (
          <li key={brand.id}>
            <Link
              href={`/brand/${brand.slug}`}
              className="border-line bg-raised hover:border-accent-line group flex h-20 flex-col items-center justify-center rounded-md border px-3 text-center transition-colors"
            >
              <span className="text-ink group-hover:text-accent-ink text-sm font-medium transition-colors">
                {brand.name}
              </span>
              <span className="text-faint mt-0.5 text-2xs">
                {formatCompactNumber(brand.productCount)} styles
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/* ------------------------------------------------------ seller spotlight */

export function SellerSpotlight({
  section,
  sellers,
}: {
  section: HomeSection;
  sellers: Seller[];
}) {
  if (sellers.length === 0) return null;

  return (
    <Section title={section.title} subtitle={section.subtitle} href={section.href}>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {sellers.map((seller) => (
          <li key={seller.id}>
            <Link
              href={`/store/${seller.slug}`}
              className="border-line bg-raised hover:border-accent-line block h-full rounded-lg border p-5 transition-colors"
            >
              <div className="flex items-center gap-2">
                <h3 className="text-ink text-sm font-semibold">{seller.displayName}</h3>
                {seller.rating.average >= 4.5 ? (
                  <Badge tone="success" size="sm">
                    Top rated
                  </Badge>
                ) : null}
              </div>

              <p className="text-muted clamp-3 mt-2 text-sm">{seller.about}</p>

              <dl className="text-faint mt-4 flex gap-4 text-2xs">
                <div>
                  <dt className="sr-only">Rating</dt>
                  <dd className="tabular">
                    <span className="text-ink font-medium">{seller.rating.average}</span> ★
                  </dd>
                </div>
                <div>
                  <dt className="sr-only">Styles</dt>
                  <dd className="tabular">
                    <span className="text-ink font-medium">{seller.metrics.liveProductCount}</span>{' '}
                    styles
                  </dd>
                </div>
                <div>
                  <dt className="sr-only">Orders shipped</dt>
                  <dd className="tabular">
                    <span className="text-ink font-medium">
                      {formatCompactNumber(seller.metrics.orderCount)}
                    </span>{' '}
                    orders
                  </dd>
                </div>
              </dl>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}

/* ------------------------------------------------------------ value props */

export function ValueProps() {
  const props = [
    {
      icon: Truck,
      title: 'Free delivery above ₹1,199',
      body: 'Standard delivery in 3–6 days, 2–4 across metros. Every estimate is calculated from your pincode, not guessed.',
    },
    {
      icon: RotateCcw,
      title: '14-day returns and exchanges',
      body: 'Unworn, tags intact. Reverse pickup is free whenever the fault is ours, and refunds land in 5 working days.',
    },
    {
      icon: ShieldCheck,
      title: 'Verified sellers only',
      body: 'Every store is GST-registered and KYC-verified before its first listing goes live. You always see who you are buying from.',
    },
  ];

  return (
    <section className="gutter shell-max py-10">
      <ul className="border-line grid gap-6 rounded-lg border p-6 sm:grid-cols-3 sm:gap-8">
        {props.map(({ icon: Icon, title, body }) => (
          <li key={title} className="flex gap-3">
            <Icon className="text-accent-ink mt-0.5 size-5 shrink-0" aria-hidden />
            <div>
              <h3 className="text-ink text-sm font-semibold">{title}</h3>
              <p className="text-muted mt-1 text-sm">{body}</p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------- primitive */

function Section({
  title,
  subtitle,
  href,
  children,
}: {
  title: string | null;
  subtitle: string | null;
  href: string | null;
  children: React.ReactNode;
}) {
  return (
    <section className="gutter shell-max py-8">
      {title ? (
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="font-display text-ink text-xl sm:text-2xl">{title}</h2>
            {subtitle ? <p className="text-muted mt-0.5 text-sm">{subtitle}</p> : null}
          </div>

          {href ? (
            <Button asChild variant="link" size="inline" className="shrink-0 text-sm">
              <Link href={href}>
                See all
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}

      {children}
    </section>
  );
}
