import { ArrowRight, RotateCcw, ShieldCheck, Truck } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { ProductCard } from '@/components/commerce/product-card';
import { Badge } from '@/components/ui/badge';
import type { Banner, Category, HomeSection, ProductSummary, Seller } from '@/domain/types';
import { formatCompactNumber } from '@/lib/format';

/**
 * Homepage section renderers.
 *
 * One component per `HomeSectionKind`. The page maps `kind` to a renderer and
 * passes the section's own `config`; no component here knows where it sits on
 * the page, which is what makes the CMS ordering real rather than cosmetic.
 */

/* ------------------------------------------------------------------ hero */

/**
 * Hero.
 *
 * An asymmetric split rather than a carousel: a carousel hides two thirds of
 * what it holds behind a control almost nobody uses, and auto-advancing one
 * moves the thing a shopper was reading. Three panels, all visible, the first
 * given the weight.
 */
export function HeroCarousel({ banners }: { banners: Banner[] }) {
  const [lead, ...rest] = banners;
  if (!lead) return null;

  return (
    <section className="gutter shell-max pt-3 sm:pt-5" aria-label="Featured">
      <div className="grid gap-2.5 lg:grid-cols-12 lg:gap-3">
        <HeroPanel banner={lead} priority size="lg" className="lg:col-span-7 xl:col-span-8" />

        <div className="grid gap-2.5 sm:grid-cols-2 lg:col-span-5 lg:grid-cols-1 lg:gap-3 xl:col-span-4">
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
  const large = size === 'lg';

  return (
    <Link
      href={banner.href}
      className={`group relative isolate flex overflow-hidden rounded-xl ${
        large ? 'aspect-[4/5] sm:aspect-[16/10] lg:aspect-[4/3] xl:aspect-[16/11]' : 'aspect-[16/9] lg:aspect-[16/8]'
      } ${className ?? ''}`}
    >
      <Image
        src={banner.imageUrl}
        alt={banner.alt}
        fill
        priority={priority}
        sizes={large ? '(max-width: 64rem) 100vw, 62vw' : '(max-width: 40rem) 100vw, (max-width: 64rem) 50vw, 31vw'}
        className="object-cover transition-transform duration-700 ease-out-quint motion-safe:group-hover:scale-[1.04]"
      />

      {/*
        A bottom-weighted scrim rather than a flat wash: it guarantees contrast
        where the copy sits without greying out the whole image.
      */}
      <div
        aria-hidden
        className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent"
      />

      <div className={`relative mt-auto ${large ? 'p-6 sm:p-9' : 'p-5 sm:p-6'}`}>
        <p
          className={`font-medium uppercase tracking-[0.18em] text-white/70 ${
            large ? 'text-2xs sm:text-xs' : 'text-2xs'
          }`}
        >
          {banner.name.split(' ').slice(-1)[0] === 'hero' ? 'Featured' : 'Edit'}
        </p>

        <h2
          className={`font-display mt-2 max-w-lg text-balance text-white ${
            large ? 'text-3xl sm:text-4xl xl:text-5xl' : 'text-xl sm:text-2xl'
          }`}
        >
          {banner.headline}
        </h2>

        {banner.subheadline ? (
          <p
            className={`mt-2 max-w-md text-pretty text-white/75 ${
              large ? 'text-sm sm:text-md' : 'text-xs sm:text-sm'
            }`}
          >
            {banner.subheadline}
          </p>
        ) : null}

        {banner.ctaLabel ? (
          <span
            className={`mt-4 inline-flex items-center gap-2 border-b border-white/40 pb-1 font-medium text-white transition-[gap,border-color] group-hover:gap-3 group-hover:border-white ${
              large ? 'text-sm' : 'text-xs'
            }`}
          >
            {banner.ctaLabel}
            <ArrowRight className="size-4" />
          </span>
        ) : null}
      </div>
    </Link>
  );
}

/* -------------------------------------------------------------- category */

/**
 * Category strip.
 *
 * Portrait tiles with the label set over the image, not circles beneath text.
 * A circle crops a garment badly and gives the label nowhere to sit, which is
 * why every tile ended up looking identical.
 */
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
      <ul className="scrollbar-none -mx-1 flex snap-x snap-mandatory gap-2.5 overflow-x-auto px-1 pb-1 sm:grid sm:grid-cols-4 sm:overflow-visible lg:grid-cols-6">
        {categories.map((category) => (
          <li key={category.id} className="w-36 shrink-0 snap-start sm:w-auto">
            <Link href={`/category/${category.slug}`} className="group block">
              <div className="bg-sunken relative aspect-[4/5] overflow-hidden rounded-lg">
                <Image
                  src={category.imageUrl}
                  alt=""
                  fill
                  loading="lazy"
                  sizes="(max-width: 40rem) 9rem, 16rem"
                  className="object-cover transition-transform duration-500 motion-safe:group-hover:scale-[1.06]"
                />
                <div
                  aria-hidden
                  className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/10 to-transparent"
                />
                <div className="absolute inset-x-0 bottom-0 p-3">
                  <p className="text-sm font-medium leading-tight text-white">{category.name}</p>
                  <p className="mt-0.5 text-2xs text-white/65">
                    {formatCompactNumber(category.productCount)} styles
                  </p>
                </div>
              </div>
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
            className="w-[52%] shrink-0 snap-start sm:w-[31%] lg:w-[23%] xl:w-[17.5%]"
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
    <section className="gutter shell-max py-10 sm:py-14">
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4 lg:gap-3">
        {banners.map((banner) => (
          <Link
            key={banner.id}
            href={banner.href}
            className="group relative aspect-[4/5] overflow-hidden rounded-xl sm:aspect-3/4"
          >
            <Image
              src={banner.imageUrl}
              alt={banner.alt}
              fill
              loading="lazy"
              sizes="(max-width: 40rem) 100vw, (max-width: 64rem) 50vw, 24vw"
              className="object-cover transition-transform duration-700 ease-out-quint motion-safe:group-hover:scale-[1.06]"
            />
            <div
              aria-hidden
              className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent"
            />
            <div className="relative mt-auto flex h-full flex-col justify-end p-5">
              <h3 className="font-display text-balance text-xl text-white">{banner.headline}</h3>
              {banner.subheadline ? (
                <p className="mt-1.5 text-xs text-white/70">{banner.subheadline}</p>
              ) : null}
              <span className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-white/90 transition-[gap] group-hover:gap-2.5">
                {banner.ctaLabel ?? 'Shop now'}
                <ArrowRight className="size-3.5" />
              </span>
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
      <ul className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {brands.map((brand) => (
          <li key={brand.id}>
            <Link
              href={`/brand/${brand.slug}`}
              className="border-line bg-raised hover:border-ink group flex h-24 flex-col items-center justify-center rounded-lg border px-3 text-center transition-[border-color,transform] duration-200 motion-safe:hover:-translate-y-0.5"
            >
              <span className="font-display text-ink text-md leading-tight">{brand.name}</span>
              <span className="text-faint mt-1 text-2xs uppercase tracking-wider">
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
              className="border-line bg-raised hover:border-ink group block h-full rounded-xl border p-5 transition-[border-color,transform] duration-200 motion-safe:hover:-translate-y-0.5"
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-display text-ink text-lg leading-tight">
                  {seller.displayName}
                </h3>
                {seller.rating.average >= 4.5 ? (
                  <Badge tone="success" size="sm">
                    Top rated
                  </Badge>
                ) : null}
              </div>

              <p className="text-muted clamp-3 mt-2.5 text-sm">{seller.about}</p>

              <dl className="border-line text-faint mt-4 flex gap-5 border-t pt-3 text-2xs">
                <div>
                  <dt className="sr-only">Rating</dt>
                  <dd className="tabular">
                    <span className="text-ink font-semibold">{seller.rating.average}</span> ★
                  </dd>
                </div>
                <div>
                  <dt className="sr-only">Styles</dt>
                  <dd className="tabular">
                    <span className="text-ink font-semibold">
                      {seller.metrics.liveProductCount}
                    </span>{' '}
                    styles
                  </dd>
                </div>
                <div>
                  <dt className="sr-only">Orders shipped</dt>
                  <dd className="tabular">
                    <span className="text-ink font-semibold">
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
    <section className="gutter shell-max py-10 sm:py-14">
      <ul className="border-line grid gap-8 rounded-xl border p-7 sm:grid-cols-3 sm:gap-10 sm:p-9">
        {props.map(({ icon: Icon, title, body }) => (
          <li key={title}>
            <Icon className="text-accent-ink size-6" aria-hidden strokeWidth={1.5} />
            <h3 className="font-display text-ink mt-3 text-md">{title}</h3>
            <p className="text-muted mt-1.5 text-sm">{body}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------------------- primitive */

/**
 * Section wrapper.
 *
 * The heading rule and generous vertical rhythm are what separate one rail
 * from the next; without them a homepage of six rails reads as one long
 * undifferentiated scroll.
 */
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
    <section className="gutter shell-max py-10 sm:py-14">
      {title ? (
        <div className="mb-5 flex items-end justify-between gap-6 sm:mb-7">
          <div className="min-w-0">
            <h2 className="font-display text-ink text-2xl sm:text-3xl">{title}</h2>
            {subtitle ? <p className="text-muted mt-1.5 text-sm">{subtitle}</p> : null}
          </div>

          {href ? (
            <Link
              href={href}
              className="text-ink hover:border-ink group shrink-0 border-b border-transparent pb-0.5 text-sm font-medium transition-colors"
            >
              <span className="inline-flex items-center gap-1.5">
                See all
                <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
              </span>
            </Link>
          ) : null}
        </div>
      ) : null}

      {children}
    </section>
  );
}
