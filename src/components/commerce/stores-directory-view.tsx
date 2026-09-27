import { ArrowRight, BadgeCheck, MapPin, Radio, Star, Store } from 'lucide-react';
import Link from 'next/link';

import { Breadcrumbs } from '@/components/commerce/breadcrumbs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Picture } from '@/components/ui/picture';
import type { StoresPageSettings, StoresPageVariant } from '@/domain/page-designs/stores';
import { groupByCity, MORE_CITIES, type DirectoryStore } from '@/domain/store-directory';
import { cn } from '@/lib/cn';
import { formatCompactNumber, formatRating } from '@/lib/format';

/**
 * The sellers directory in each layout.
 *
 * `stores` arrives already ordered (`orderStores`). What is live right now is
 * request-time data, so it arrives separately as `live` -- a node the route
 * renders in its own `<Suspense>`, leaving everything here prerendered.
 */
export function StoresDirectoryView({
  stores,
  variant,
  settings,
  live,
  banner,
}: {
  stores: DirectoryStore[];
  variant: StoresPageVariant;
  settings: StoresPageSettings;
  live: React.ReactNode;
  banner?: React.ReactNode;
}) {
  return (
    <div className="gutter shell-max py-5">
      {banner}
      {settings.breadcrumbs ? <Breadcrumbs items={[{ href: '/', label: 'Home' }, { href: '/stores', label: 'Sellers' }]} /> : null}

      <header className={cn('mt-3', variant === 'market' && 'bg-sunken rounded-3xl p-6 sm:p-10')}>
        {variant === 'market' ? (
          <p className="text-accent-ink inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.2em]">
            <MapPin className="size-3.5" aria-hidden /> {new Set(stores.map((store) => store.city).filter(Boolean)).size} cities
          </p>
        ) : null}
        <h1 className={cn('font-display text-ink', variant === 'classic' ? 'text-2xl sm:text-3xl' : 'mt-2 text-3xl font-bold sm:text-5xl')}>
          {settings.title || 'Sellers on VestraWAB'}
        </h1>
        {settings.intro ? (
          <p className="text-muted mt-2 max-w-2xl text-pretty text-sm sm:text-base">
            Independent labels, workshops and family businesses selling direct. Our team reviews every store before it can
            sell.
          </p>
        ) : null}
      </header>

      {live}

      {stores.length === 0 ? (
        <div className="border-line mt-8 rounded-xl border border-dashed">
          <EmptyState
            icon={Store}
            title="No stores open yet"
            body="The first sellers are setting up. If you make something worth selling, you could be one of them."
            action={
              <Button asChild size="sm" shape="pill">
                <Link href="/sell-with-us">Sell on VestraWAB</Link>
              </Button>
            }
          />
        </div>
      ) : variant === 'market' ? (
        <Market stores={stores} settings={settings} />
      ) : variant === 'stories' ? (
        <Ranked stores={stores} settings={settings} />
      ) : (
        <ul className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {stores.map((store) => (
            <li key={store.id}>
              <StoreCard store={store} settings={settings} />
            </li>
          ))}
        </ul>
      )}

      {settings.sellInvite ? <SellInvite /> : null}
    </div>
  );
}

/* ------------------------------------------------------------ layouts */

/** Local markets: a group per city, with a bar to jump between them. */
function Market({ stores, settings }: { stores: DirectoryStore[]; settings: StoresPageSettings }) {
  const groups = groupByCity(stores);
  return (
    <>
      {settings.cityJump && groups.length > 1 ? (
        <nav aria-label="Jump to a city" className="glass border-line sticky top-(--app-sticky-offset) z-20 -mx-4 mt-6 border-b px-4 py-2.5 sm:-mx-6 sm:px-6">
          <ul className="no-scrollbar flex gap-2 overflow-x-auto">
            {groups.map((group) => (
              <li key={group.anchor} className="shrink-0">
                <a
                  href={`#${group.anchor}`}
                  className="border-line-control bg-raised text-ink hover:border-ink inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 text-xs font-medium transition-colors"
                >
                  {group.city}
                  <span className="text-faint">{group.stores.length}</span>
                </a>
              </li>
            ))}
          </ul>
        </nav>
      ) : null}
      {groups.map((group) => (
        <section key={group.anchor} id={group.anchor} aria-labelledby={`${group.anchor}-title`} className="mt-10 scroll-mt-[calc(var(--app-sticky-offset)+4.5rem)]">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id={`${group.anchor}-title`} className="font-display text-ink text-xl font-bold sm:text-2xl">
              {group.city}
            </h2>
            <p className="text-muted text-xs">
              {group.stores.length} {group.stores.length === 1 ? 'store' : 'stores'}
            </p>
          </div>
          <ul className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {group.stores.map((store) => (
              <li key={store.id}>
                <StoreCard store={store} settings={settings} hideCity={group.city !== MORE_CITIES} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

/** Ranked: the stores in the page's order, numbered, the first three larger. */
function Ranked({ stores, settings }: { stores: DirectoryStore[]; settings: StoresPageSettings }) {
  const heading =
    settings.order === 'trust'
      ? 'Most trusted'
      : settings.order === 'orders'
        ? 'Most orders shipped'
        : settings.order === 'newest'
          ? 'Newest stores'
          : 'Top rated';
  const podium = stores.filter((store) => store.liveProducts > 0).slice(0, 3);
  const rest = stores.filter((store) => !podium.includes(store));
  return (
    <section aria-labelledby="ranked-title" className="mt-10">
      <h2 id="ranked-title" className="font-display text-ink text-xl font-bold sm:text-2xl">
        {heading}
      </h2>
      <ol className="mt-4 grid gap-4 md:grid-cols-3">
        {podium.map((store, index) => (
          <li key={store.id}>
            <StoreCard store={store} settings={settings} rank={index + 1} large />
          </li>
        ))}
      </ol>
      {rest.length ? (
        <ol start={podium.length + 1} className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {rest.map((store, index) => (
            <li key={store.id}>
              <StoreCard store={store} settings={settings} rank={store.liveProducts > 0 ? podium.length + index + 1 : undefined} />
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

/* --------------------------------------------------------------- card */

function StoreCard({
  store,
  settings,
  rank,
  large = false,
  hideCity = false,
}: {
  store: DirectoryStore;
  settings: StoresPageSettings;
  rank?: number;
  large?: boolean;
  hideCity?: boolean;
}) {
  const open = store.liveProducts > 0;
  const facts = [
    hideCity ? null : store.city || null,
    store.ratingCount > 0 ? `${formatRating(store.ratingAverage)}★` : null,
    !settings.stats && store.orders > 0 ? `${formatCompactNumber(store.orders)} orders` : null,
    open ? `${formatCompactNumber(store.liveProducts)} styles` : null,
  ].filter(Boolean);

  return (
    <Link
      href={`/store/${store.slug}`}
      className="border-line bg-raised hover:border-accent-line group flex h-full flex-col overflow-hidden rounded-2xl border transition-colors"
    >
      {settings.banners ? (
        <div className="relative">
          <Picture
            src={store.banner}
            name={store.name}
            sizes={large ? '(min-width: 768px) 33vw, 100vw' : '(min-width: 1024px) 25vw, (min-width: 640px) 50vw, 100vw'}
            className={cn('w-full', large ? 'aspect-[2/1]' : 'aspect-[16/7]')}
            imageClassName="transition-transform duration-500 group-hover:scale-[1.03] motion-reduce:transition-none"
          />
          {rank ? (
            <span className="font-display absolute left-3 top-3 grid size-9 place-items-center rounded-full bg-white/95 text-sm font-bold text-neutral-900 shadow">
              {rank}
            </span>
          ) : null}
          <Picture
            src={store.logo}
            name={store.name}
            sizes="56px"
            className={cn('border-raised absolute -bottom-6 left-4 rounded-xl border-4 shadow-sm', large ? 'size-16' : 'size-12')}
          />
        </div>
      ) : null}

      <div className={cn('flex flex-1 flex-col p-5', settings.banners && 'pt-8')}>
        <div className="flex items-start justify-between gap-2">
          <h3 className={cn('text-ink flex min-w-0 items-center gap-1 font-semibold', large ? 'text-base' : 'text-sm')}>
            {!settings.banners && rank ? <span className="text-faint mr-1 tabular-nums">{rank}.</span> : null}
            <span className="truncate">{store.name}</span>
            {store.verified ? <BadgeCheck className="text-info-600 size-4 shrink-0" aria-label="Verified seller" /> : null}
          </h3>
          {!open ? (
            <Badge tone="neutral" size="sm">
              Opening soon
            </Badge>
          ) : store.isNew ? (
            <Badge tone="info" size="sm">
              New
            </Badge>
          ) : store.ratingCount > 0 && store.ratingAverage >= 4.5 ? (
            <Badge tone="success" size="sm">
              Top rated
            </Badge>
          ) : null}
        </div>

        {store.tagline ? <p className="text-accent-ink mt-1 line-clamp-1 text-xs">{store.tagline}</p> : null}

        {settings.about ? (
          <p className="text-muted mt-2 line-clamp-3 flex-1 text-sm">
            {store.about || 'A new store on VestraWAB. Its first products are on the way.'}
          </p>
        ) : (
          <span className="flex-1" />
        )}

        {settings.stats && open && store.stats.length ? (
          <dl className="border-line mt-4 grid grid-cols-3 divide-line divide-x rounded-xl border text-center">
            {store.stats.map((stat) => (
              <div key={stat.key} className="px-1.5 py-2">
                <dt className="text-faint text-2xs leading-tight">{stat.label}</dt>
                <dd className="text-ink mt-0.5 text-sm font-semibold tabular-nums">{stat.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}

        {facts.length > 0 ? <p className="text-faint mt-3 text-2xs">{facts.join(' · ')}</p> : null}
      </div>
    </Link>
  );
}

/* ------------------------------------------------------- live and story */

/**
 * Round logos in a row, like the stories on a phone: live stores ringed in
 * red and marked LIVE, new ones marked NEW, the rest ringed in the brand
 * gradient. `live` is empty in the prerendered fallback, so the row paints
 * at once and only the rings change when presence arrives.
 */
export function StoryRow({ stores, live }: { stores: DirectoryStore[]; live: ReadonlySet<string> }) {
  if (stores.length === 0) return null;
  return (
    <nav aria-label="Stores to follow" className="mt-6">
      <ul className="no-scrollbar -mx-1 flex gap-4 overflow-x-auto px-1 pb-2 sm:gap-5">
        {stores.slice(0, 24).map((store) => {
          const isLive = live.has(store.id);
          return (
            <li key={store.id} className="w-20 shrink-0 sm:w-24">
              <Link href={`/store/${store.slug}`} className="group flex flex-col items-center text-center">
                <span
                  className={cn(
                    'relative rounded-full p-[3px]',
                    isLive
                      ? 'bg-[conic-gradient(#ef4444,#f97316,#ec4899,#ef4444)]'
                      : 'bg-[conic-gradient(#f59e0b,#ef4444,#d946ef,#8b5cf6,#f59e0b)]',
                  )}
                >
                  <span className="bg-canvas block rounded-full p-[2px]">
                    <Picture src={store.logo} name={store.name} sizes="88px" className="size-16 rounded-full sm:size-20" />
                  </span>
                  {isLive || store.isNew ? (
                    <span
                      className={cn(
                        'text-2xs absolute -bottom-1 left-1/2 -translate-x-1/2 rounded-md px-1.5 py-px font-bold uppercase tracking-wide text-white ring-2 ring-[var(--color-canvas)]',
                        isLive ? 'bg-red-600' : 'bg-accent',
                      )}
                    >
                      {isLive ? 'Live' : 'New'}
                    </span>
                  ) : null}
                </span>
                <span className="text-ink mt-2 line-clamp-2 text-xs font-medium leading-tight">{store.name}</span>
                {isLive ? <span className="sr-only">, live for video calls now</span> : null}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Without the story row: a slim band of whoever is live, or nothing at all. */
export function LiveBand({ stores }: { stores: DirectoryStore[] }) {
  if (stores.length === 0) return null;
  return (
    <aside aria-label="Stores live now" className="mt-6 flex items-center gap-3 rounded-2xl bg-red-50 px-4 py-3 text-red-900 dark:bg-red-950/40 dark:text-red-100">
      <span className="inline-flex items-center gap-1.5 text-sm font-semibold">
        <Radio className="size-4 animate-pulse motion-reduce:animate-none" aria-hidden />
        Live now
      </span>
      <ul className="no-scrollbar flex min-w-0 items-center gap-2 overflow-x-auto">
        {stores.slice(0, 6).map((store) => (
          <li key={store.id}>
            <Link href={`/store/${store.slug}`} className="inline-flex min-h-10 items-center gap-2 whitespace-nowrap rounded-full bg-white/80 py-1 pl-1 pr-3 text-xs font-medium text-neutral-900">
              <Picture src={store.logo} name={store.name} sizes="32px" className="size-8 rounded-full" />
              {store.name}
            </Link>
          </li>
        ))}
      </ul>
      <p className="ml-auto hidden shrink-0 text-xs opacity-80 md:block">They can show you anything on a video call.</p>
    </aside>
  );
}

function SellInvite() {
  return (
    <section className="bg-inverse text-on-inverse mt-14 flex flex-col items-start gap-4 rounded-3xl p-6 sm:flex-row sm:items-center sm:justify-between sm:p-10">
      <div>
        <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.2em] opacity-75">
          <Star className="size-3.5" aria-hidden /> For makers and shops
        </p>
        <h2 className="font-display mt-2 text-2xl font-bold sm:text-3xl">Your shop, online in a day.</h2>
        <p className="mt-2 max-w-lg text-sm opacity-80">
          Sell to shoppers across India, take video calls from your counter, and get paid on a fixed schedule.
        </p>
      </div>
      <Button asChild shape="pill" variant="secondary">
        <Link href="/sell-with-us">
          Open your store <ArrowRight className="size-4" aria-hidden />
        </Link>
      </Button>
    </section>
  );
}
