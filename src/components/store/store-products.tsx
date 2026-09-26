import { Clapperboard, LayoutGrid, PackageOpen } from 'lucide-react';
import Link from 'next/link';

import { SortChips } from '@/components/commerce/listing-toolbar';
import { ListingView } from '@/components/commerce/listing-view';
import { Pagination } from '@/components/commerce/pagination';
import { ProductGrid } from '@/components/commerce/product-grid';
import { EmptyState } from '@/components/ui/empty-state';
import type { ProductStyle, StorePageSettings, StorePageVariant } from '@/domain/store-page';
import { cn } from '@/lib/cn';
import { parseProductQuery, withParam, type RawSearchParams } from '@/lib/product-query';
import { listProducts } from '@/server/services/listing';

import { StoreReels } from './store-reels';

/**
 * The store's catalogue, in whichever form the layout's switches ask for.
 *
 *   grid + filters   the full shared listing: rail, drawer, chips, pages
 *   grid             just the cards and the pages
 *   reels            the reel wall, with sort chips if filters are on
 *
 * Studio additionally lets the SHOPPER flip between reels and grid with the
 * two tabs every profile page has; `?view=` carries that, and the layout's
 * own setting is only the tab it opens on.
 *
 * Rendered inside the page's Suspense boundary: it reads `searchParams`.
 */
export async function StoreProducts({
  slug,
  basePath,
  searchParams,
  settings,
  variant,
}: {
  slug: string;
  /** Where links on this listing point: the store, or its preview. */
  basePath: string;
  searchParams: Promise<RawSearchParams>;
  settings: StorePageSettings;
  variant: StorePageVariant;
}) {
  const raw = await searchParams;
  const query = parseProductQuery(raw, { sellerSlug: slug });
  const result = await listProducts(query);
  const sort = query.sort ?? 'popularity';

  const tabs = variant === 'studio';
  const requested = typeof raw.view === 'string' ? raw.view : undefined;
  const view: ProductStyle =
    tabs && (requested === 'grid' || requested === 'reels') ? requested : settings.productStyle;

  const search = settings.search ? (
    <form action={basePath} className="flex w-full gap-2 sm:w-auto">
      {tabs && requested ? <input type="hidden" name="view" value={requested} /> : null}
      <input
        name="q"
        defaultValue={query.q}
        aria-label="Search this store"
        placeholder="Search this store"
        className="bg-raised border-line h-11 min-w-0 flex-1 rounded-xl border px-3 text-sm"
      />
      <button className="bg-ink text-canvas rounded-xl px-4 text-sm">Search</button>
    </form>
  ) : null;

  const heading = tabs ? (
    <div className="space-y-3">
      <nav aria-label="Product views" className="border-line grid grid-cols-2 border-t">
        <ViewTab href={withParam(raw, 'view', 'reels', basePath)} active={view === 'reels'} icon={<Clapperboard className="size-4" aria-hidden />} label={settings.productsTitle || 'Reels'} />
        <ViewTab href={withParam(raw, 'view', 'grid', basePath)} active={view === 'grid'} icon={<LayoutGrid className="size-4" aria-hidden />} label="Grid" />
      </nav>
      {search}
    </div>
  ) : settings.productsTitle || search ? (
    <div className="flex flex-wrap items-center justify-between gap-3">
      {settings.productsTitle ? (
        <h2 className="font-display text-xl font-semibold sm:text-2xl">{settings.productsTitle}</h2>
      ) : (
        <span />
      )}
      {search}
    </div>
  ) : null;

  const wrap = cn('mt-6', tabs && 'mx-auto max-w-4xl');

  if (view === 'grid' && settings.filters) {
    return (
      <ListingView
        heading={heading}
        result={result}
        params={raw}
        basePath={basePath}
        sort={sort}
        className={wrap}
      />
    );
  }

  const empty = (
    <EmptyState
      icon={PackageOpen}
      title={query.q ? `Nothing here matches “${query.q}”` : 'Nothing listed yet'}
      body={query.q ? 'Try a shorter word, or clear the search.' : 'This store has not published any products yet.'}
      className="mt-6"
    />
  );

  return (
    <section className={wrap} aria-label="Products">
      {heading}

      {view === 'reels' && settings.filters && result.items.length > 0 ? (
        <SortChips activeSort={sort} params={raw} basePath={basePath} className="no-scrollbar mt-4 overflow-x-auto" />
      ) : null}

      {result.items.length === 0 ? (
        empty
      ) : view === 'reels' ? (
        <StoreReels
          products={result.items}
          density={tabs ? 'tight' : 'roomy'}
          showPrices={settings.prices}
          showPlay={settings.playButton}
          className="mt-4"
        />
      ) : (
        <ProductGrid products={result.items} className="mt-4" />
      )}

      <div className="mt-8">
        <Pagination page={result.page} pageCount={result.pageCount} params={raw} basePath={basePath} />
      </div>
    </section>
  );
}

function ViewTab({ href, active, icon, label }: { href: string; active: boolean; icon: React.ReactNode; label: string }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? 'page' : undefined}
      className={cn(
        '-mt-px flex min-h-12 items-center justify-center gap-2 border-t-2 text-xs font-semibold uppercase tracking-[0.12em]',
        active ? 'border-ink text-ink' : 'text-muted hover:text-ink border-transparent',
      )}
    >
      {icon}
      {label}
    </Link>
  );
}
