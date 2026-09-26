import { BadgeCheck, MessageCircle, PackageCheck, ShieldCheck, Truck } from 'lucide-react';

import { ShareMenu } from '@/components/commerce/share-menu';
import { Picture } from '@/components/ui/picture';
import type { StorePageSettings } from '@/domain/store-page';
import type { Seller } from '@/domain/types';
import { cn } from '@/lib/cn';
import { storeStats, whatsappLink, type StoreStat } from '@/lib/store-stats';

const STAT_ICON: Record<StoreStat['key'], React.ReactNode> = {
  trustScore: <ShieldCheck className="size-5" aria-hidden />,
  deliveryTime: <Truck className="size-5" aria-hidden />,
  ordersShipped: <PackageCheck className="size-5" aria-hidden />,
};

/**
 * Store page, Variant 2 ("Spotlight").
 *
 * A shop sign, not a profile card. The banner is one bold rectangle with the
 * store's own photograph behind it, the logo set INSIDE its left edge and the
 * name filling the rest in heavy display type -- the way a shopfront reads
 * from across the street. Under it, three numbers and nothing else, because
 * the shopper came for the stock and the reels start straight after.
 *
 * The photograph sits under a directional scrim, darkest behind the name, so
 * white type stays legible over whatever the seller uploaded.
 */
export function SpotlightHeader({
  seller,
  settings,
}: {
  seller: Seller;
  settings: StorePageSettings;
}) {
  const stats = storeStats(seller, settings);
  const verified = settings.verifiedBadge && Boolean(seller.kyc.verifiedAt);
  const chat = settings.contactButton ? whatsappLink(seller.supportPhone, seller.displayName) : null;

  return (
    <header className="mt-3">
      <div className="relative isolate overflow-hidden rounded-3xl bg-neutral-900 text-white">
        {settings.banner && seller.bannerUrl ? (
          <Picture
            src={seller.bannerUrl}
            name={seller.displayName}
            sizes="100vw"
            className="absolute inset-0 -z-10"
            priority
          />
        ) : (
          <div
            aria-hidden
            className="absolute inset-0 -z-10 bg-gradient-to-br from-neutral-800 via-neutral-900 to-black"
          />
        )}
        <div
          aria-hidden
          className="absolute inset-0 -z-10 bg-gradient-to-r from-black/80 via-black/55 to-black/20"
        />

        {settings.shareButton ? (
          <div className="absolute right-3 top-3 z-10 sm:right-5 sm:top-5">
            <ShareMenu
              title={seller.displayName}
              path={`/store/${seller.slug}`}
              showWhatsApp
              className="border-white/25 bg-black/30 text-white backdrop-blur"
            />
          </div>
        ) : null}

        <div className="flex min-h-44 items-center gap-4 px-4 py-7 sm:min-h-64 sm:gap-7 sm:px-10 sm:py-10 lg:min-h-80 lg:px-14">
          {settings.logo ? (
            <Picture
              src={seller.logoUrl}
              name={seller.displayName}
              sizes="(max-width: 40rem) 5rem, 9rem"
              fit="contain"
              className="size-20 shrink-0 rounded-2xl bg-white shadow-xl ring-4 ring-white/20 sm:size-32 lg:size-36"
            />
          ) : null}

          <div className="min-w-0 flex-1">
            <h1
              className={cn(
                'font-display font-black uppercase tracking-tight text-white break-words',
                // After the size: tailwind-merge drops a leading that precedes a font size.
                'text-[clamp(1.9rem,7vw,5.5rem)] leading-[1.02] drop-shadow-[0_2px_12px_rgba(0,0,0,0.35)]',
                !settings.shopName && 'sr-only',
              )}
            >
              {seller.displayName}
              {verified ? (
                <BadgeCheck
                  className="ml-2 inline-block size-[0.55em] align-[0.1em] text-sky-300"
                  aria-label="Verified seller"
                />
              ) : null}
            </h1>

            {settings.tagline && seller.tagline ? (
              <p className="mt-2 max-w-xl text-sm text-white/80 sm:mt-3 sm:text-lg">{seller.tagline}</p>
            ) : null}

            {settings.location ? (
              <p className="mt-2 text-xs text-white/65 sm:text-sm">
                {seller.kyc.registeredAddress.city} · Since {new Date(seller.joinedAt).getFullYear()}
              </p>
            ) : null}

            {chat ? (
              <a
                href={chat}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-full bg-[#1f9d55] px-5 text-sm font-semibold text-white shadow-lg"
              >
                <MessageCircle className="size-4" aria-hidden />
                WhatsApp the store
              </a>
            ) : null}
          </div>
        </div>
      </div>

      {stats.length > 0 ? (
        <ul
          className="mt-3 grid gap-2 sm:mt-4 sm:gap-4"
          style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))` }}
        >
          {stats.map((stat) => (
            <li
              key={stat.key}
              className="bg-raised border-line flex flex-col items-center gap-1 rounded-2xl border px-2 py-3 text-center sm:flex-row sm:gap-3 sm:px-5 sm:py-4 sm:text-left"
            >
              <span className="bg-accent/10 text-accent-ink grid size-9 shrink-0 place-items-center rounded-full sm:size-11">
                {STAT_ICON[stat.key]}
              </span>
              <span className="flex min-w-0 flex-col">
                <span className="text-ink text-base font-bold leading-tight break-words sm:text-2xl">{stat.value}</span>
                <span className="text-muted text-[11px] sm:text-xs">{stat.label}</span>
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </header>
  );
}
