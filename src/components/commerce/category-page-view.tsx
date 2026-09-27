import { ArrowRight, BadgePercent, Sparkles, Star, Tag } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { Breadcrumbs } from '@/components/commerce/breadcrumbs';
import { ProductCard } from '@/components/commerce/product-card';
import type { CategoryPageSettings, CategoryPageVariant } from '@/domain/page-designs/category';
import type { Category, ProductSummary } from '@/domain/types';
import { cn } from '@/lib/cn';

/**
 * The category page above and below its listing, in each layout.
 *
 * The listing itself arrives as `listing`: it depends on the query string, so
 * the route renders it inside its own `<Suspense>` and this frame -- built
 * only from the category and cached data -- prerenders around it.
 */
export function CategoryPageView({
  category,
  ancestors,
  subcategories,
  topPicks,
  variant,
  settings,
  listing,
  banner,
}: {
  category: Category;
  ancestors: Category[];
  subcategories: Category[];
  topPicks: ProductSummary[];
  variant: CategoryPageVariant;
  settings: CategoryPageSettings;
  listing: React.ReactNode;
  /** The staff preview's notice, above everything. */
  banner?: React.ReactNode;
}) {
  const crumbs = settings.breadcrumbs ? (
    <Breadcrumbs
      items={[
        { href: '/', label: 'Home' },
        ...ancestors.map((c) => ({ href: `/category/${c.slug}`, label: c.name })),
      ]}
    />
  ) : null;

  const types = settings.subcategories && subcategories.length ? (
    <ShopByType category={category} items={subcategories} style={settings.subcategoryStyle === 'tiles' ? 'tiles' : 'chips'} />
  ) : null;

  const picks = settings.topPicks && topPicks.length >= 4 ? <TopPicks title={settings.topPicksTitle || 'Bestsellers this week'} products={topPicks} /> : null;

  return (
    <div className="gutter shell-max py-5">
      {banner}
      {crumbs}
      {variant === 'editorial' ? (
        <EditorialHeader category={category} settings={settings} />
      ) : variant === 'wall' ? (
        <WallHeader category={category} settings={settings} />
      ) : (
        <ClassicHeader category={category} settings={settings} />
      )}
      {types}
      {picks}
      {listing}
      {settings.seoIntro && category.seoIntro ? (
        /*
          SEO copy sits BELOW the grid: it is written for crawlers and for
          shoppers who scrolled the whole page, and putting it above would push
          the products people came for off the fold.
        */
        <section className="border-line mt-12 border-t pt-6">
          <h2 className="text-ink text-sm font-semibold">About {category.name}</h2>
          <p className="text-muted mt-2 max-w-3xl text-pretty text-sm">{category.seoIntro}</p>
        </section>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------ headers */

type HeaderProps = { category: Category; settings: CategoryPageSettings };

/**
 * Tight on a phone. Breadcrumb, heading, description, a filter button, a
 * count and a sort row used to fill two thirds of an 844px screen before the
 * first product, so the description is clamped and the rest folds into the
 * listing's sticky bar.
 */
function ClassicHeader({ category, settings }: HeaderProps) {
  const image = settings.hero ? (category.bannerUrl ?? category.imageUrl) : null;
  return (
    <header className={cn('relative mt-3 overflow-hidden rounded-3xl', image ? 'bg-ink min-h-48 sm:min-h-64' : 'bg-sunken')}>
      {image ? <Image src={image} alt="" fill priority sizes="(min-width: 1024px) 1200px, 100vw" className="object-cover" /> : null}
      {image ? <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/50 to-black/10" /> : null}
      <div className={cn('relative flex max-w-2xl flex-col justify-end p-5 sm:p-10', image ? 'min-h-48 text-white sm:min-h-64' : 'text-ink')}>
        {settings.eyebrow ? (
          <p className={cn('mb-2 text-xs font-semibold uppercase tracking-[0.2em]', image ? 'text-white/75' : 'text-muted')}>{settings.eyebrow}</p>
        ) : null}
        <h1 className={cn('font-display text-3xl font-bold leading-tight sm:text-5xl', image ? 'text-white' : 'text-ink')}>{category.name}</h1>
        {settings.description && category.description ? (
          <p className={cn('mt-2 line-clamp-2 max-w-xl text-sm leading-relaxed sm:mt-3 sm:line-clamp-3', image ? 'text-white/85' : 'text-muted')}>
            {category.description}
          </p>
        ) : null}
      </div>
    </header>
  );
}

/**
 * A department front: the name set large on the page's own ground, the
 * picture beside it rather than behind it, so the type never fights a busy
 * photograph for contrast.
 */
function EditorialHeader({ category, settings }: HeaderProps) {
  const image = settings.hero ? (category.bannerUrl ?? category.imageUrl) : null;
  return (
    <header className={cn('mt-4 grid items-stretch gap-4 sm:gap-6', image && 'md:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]')}>
      <div className="bg-sunken flex flex-col justify-end rounded-3xl p-5 sm:p-10">
        {settings.eyebrow ? <p className="text-accent-ink text-xs font-semibold uppercase tracking-[0.25em]">{settings.eyebrow}</p> : null}
        <h1 className="font-display text-ink mt-3 text-4xl font-bold leading-[1.02] tracking-tight sm:text-6xl">{category.name}</h1>
        {settings.description && category.description ? (
          <p className="text-muted mt-4 line-clamp-3 max-w-md text-pretty text-sm leading-relaxed sm:text-base">{category.description}</p>
        ) : null}
        <a href="#listing" className="text-ink mt-3 inline-flex min-h-11 sm:mt-6 items-center gap-2 self-start text-sm font-semibold underline-offset-4 hover:underline">
          Shop the edit <ArrowRight className="size-4" aria-hidden />
        </a>
      </div>
      {image ? (
        <div className="bg-sunken relative hidden min-h-72 overflow-hidden rounded-3xl md:block">
          <Image src={image} alt="" fill priority sizes="(min-width: 1024px) 640px, 50vw" className="object-cover" />
        </div>
      ) : null}
    </header>
  );
}

/** Out of the way: on the wall, the photographs are the header. */
function WallHeader({ category, settings }: HeaderProps) {
  const image = settings.hero ? category.imageUrl : null;
  return (
    <header className="mt-3 flex items-center gap-3 sm:gap-4">
      {image ? (
        <span className="bg-sunken relative size-14 shrink-0 overflow-hidden rounded-full sm:size-16">
          <Image src={image} alt="" fill sizes="64px" className="object-cover" />
        </span>
      ) : null}
      <div className="min-w-0">
        {settings.eyebrow ? <p className="text-muted text-2xs font-semibold uppercase tracking-[0.2em]">{settings.eyebrow}</p> : null}
        <h1 className="font-display text-ink text-2xl font-bold leading-tight sm:text-3xl">{category.name}</h1>
        {settings.description && category.description ? <p className="text-muted mt-0.5 line-clamp-1 text-sm">{category.description}</p> : null}
      </div>
    </header>
  );
}

/* ------------------------------------------------------- discovery */

function ShopByType({ category, items, style }: { category: Category; items: Category[]; style: 'chips' | 'tiles' }) {
  if (style === 'chips') {
    return (
      <nav aria-label={`Shop ${category.name} by type`} className="no-scrollbar mt-4 flex gap-2 overflow-x-auto pb-1">
        {items.map((child) => (
          <Link
            key={child.id}
            href={`/category/${child.slug}`}
            className="border-line bg-raised text-ink hover:border-ink inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-xs font-semibold transition-colors"
          >
            {child.name}
          </Link>
        ))}
      </nav>
    );
  }
  return (
    <nav aria-label={`Shop ${category.name} by type`} className="mt-6">
      <h2 className="text-ink text-sm font-semibold">Shop by type</h2>
      <ul className="no-scrollbar mt-3 flex snap-x gap-3 overflow-x-auto pb-1">
        {items.map((child) => (
          <li key={child.id} className="w-28 shrink-0 snap-start sm:w-36">
            <Link href={`/category/${child.slug}`} className="group block">
              <span className="bg-sunken relative block aspect-4/5 overflow-hidden rounded-2xl">
                <Image src={child.imageUrl} alt="" fill sizes="9rem" className="object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none" />
              </span>
              <span className="text-ink mt-2 line-clamp-1 block text-center text-xs font-semibold sm:text-sm">{child.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

function TopPicks({ title, products }: { title: string; products: ProductSummary[] }) {
  return (
    <section aria-label={title} className="mt-8">
      <h2 className="font-display text-ink text-xl font-bold sm:text-2xl">{title}</h2>
      <ul className="no-scrollbar mt-4 flex snap-x gap-3 overflow-x-auto pb-2 sm:gap-4">
        {products.map((product) => (
          <li key={product.id} className="w-40 shrink-0 snap-start sm:w-52">
            <ProductCard product={product} />
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ------------------------------------------------ tiles inside the grid */

/**
 * The shortcut tiles an Editorial or Visual wall listing places between
 * products: each is a link to this same listing with one filter or sort
 * applied, so a tile can never point at something the category lacks.
 */
export function categoryTiles(basePath: string, categoryName: string): React.ReactNode[] {
  const tiles = [
    { href: `${basePath}?sort=newest`, title: 'New in', body: `The latest ${categoryName.toLowerCase()}, first.`, icon: Sparkles, tone: 'from-iris-100 to-iris-50 text-iris-900' },
    { href: `${basePath}?maxPrice=999`, title: 'Under ₹999', body: 'Everyday picks that do not need a second thought.', icon: Tag, tone: 'from-sand-100 to-sand-50 text-sand-900' },
    { href: `${basePath}?rating=4`, title: 'Top rated', body: 'Four stars and above, from people who wore them.', icon: Star, tone: 'from-success-100 to-success-50 text-success-900' },
    { href: `${basePath}?discount=30`, title: '30% off and more', body: 'The deepest discounts in this category.', icon: BadgePercent, tone: 'from-danger-100 to-danger-50 text-danger-900' },
  ];
  return tiles.map((tile) => (
    <Link
      key={tile.title}
      href={tile.href}
      className={cn('flex h-full min-h-56 flex-col justify-between rounded-2xl bg-gradient-to-br p-4 transition-transform hover:-translate-y-0.5 sm:p-5', tile.tone)}
    >
      <tile.icon className="size-6" aria-hidden />
      <span>
        <span className="font-display block text-xl font-bold leading-tight sm:text-2xl">{tile.title}</span>
        <span className="mt-1.5 block text-xs opacity-80 sm:text-sm">{tile.body}</span>
        <span className="mt-3 inline-flex items-center gap-1 text-xs font-semibold">
          Shop now <ArrowRight className="size-3.5" aria-hidden />
        </span>
      </span>
    </Link>
  ));
}
