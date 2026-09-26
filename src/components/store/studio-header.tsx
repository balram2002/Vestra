import { BadgeCheck, MapPin, MessageCircle, Star } from 'lucide-react';

import { ShareMenu } from '@/components/commerce/share-menu';
import { Picture } from '@/components/ui/picture';
import type { StorePageSettings } from '@/domain/store-page';
import type { Seller } from '@/domain/types';
import { cn } from '@/lib/cn';
import { formatCompactNumber } from '@/lib/format';
import { storeStats, whatsappLink } from '@/lib/store-stats';

/**
 * Store page, Variant 3 ("Studio").
 *
 * The page a shop that sells on Instagram already has in its head: a round
 * logo in a story ring, the name, three counters in a row, a two-line bio and
 * the buttons under it -- then the grid. Nothing on it needs explaining to
 * someone who arrived from a bio link, which is the point.
 *
 * The banner, when on, is a short cover the ring overlaps rather than a hero:
 * on this layout the store's face is the logo, not the photograph.
 */
export function StudioHeader({
  seller,
  settings,
}: {
  seller: Seller;
  settings: StorePageSettings;
}) {
  const stats = storeStats(seller, settings);
  const verified = settings.verifiedBadge && Boolean(seller.kyc.verifiedAt);
  const chat = settings.contactButton ? whatsappLink(seller.supportPhone, seller.displayName) : null;
  const hasCover = settings.banner && Boolean(seller.bannerUrl);

  return (
    <header className="mx-auto mt-3 max-w-4xl">
      {hasCover ? (
        <div className="relative h-28 overflow-hidden rounded-3xl sm:h-44">
          <Picture
            src={seller.bannerUrl}
            name={seller.displayName}
            sizes="(max-width: 56rem) 100vw, 56rem"
            className="absolute inset-0"
            priority
          />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-transparent to-black/30" />
        </div>
      ) : null}

      <div
        className={cn(
          'flex flex-col items-center gap-4 px-2 text-center sm:flex-row sm:items-end sm:gap-8 sm:px-6 sm:text-left',
          !(hasCover && settings.logo) && 'pt-4',
        )}
      >
        {settings.logo ? (
          // Only the ring overlaps the cover; the name and counters sit below it.
          <span className={cn('bg-canvas relative shrink-0 rounded-full p-1', hasCover && '-mt-12 sm:-mt-16')}>
            <span className="block rounded-full bg-[conic-gradient(from_210deg,#f59e0b,#ef4444,#d946ef,#8b5cf6,#f59e0b)] p-[3px]">
              <span className="bg-canvas block rounded-full p-[3px]">
                <Picture
                  src={seller.logoUrl}
                  name={seller.displayName}
                  sizes="9rem"
                  fit="contain"
                  className="size-24 rounded-full bg-white sm:size-32"
                />
              </span>
            </span>
          </span>
        ) : null}

        <div className="min-w-0 flex-1 pb-1">
          <h1
            className={cn(
              'font-display text-ink inline-flex max-w-full items-center gap-1.5 text-2xl font-extrabold tracking-tight break-words sm:text-3xl',
              !settings.shopName && 'sr-only',
            )}
          >
            <span className="min-w-0">{seller.displayName}</span>
            {verified ? (
              <BadgeCheck className="text-info-600 size-6 shrink-0" aria-label="Verified seller" />
            ) : null}
          </h1>

          {stats.length > 0 ? (
            <ul className="mt-3 flex justify-center gap-6 sm:justify-start sm:gap-10">
              {stats.map((stat) => (
                <li key={stat.key} className="min-w-0">
                  <span className="text-ink block text-lg font-bold leading-tight sm:text-xl">{stat.value}</span>
                  <span className="text-muted block text-2xs sm:text-xs">{stat.label}</span>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>

      <div className="mt-4 px-2 text-center sm:px-6 sm:text-left">
        {settings.tagline && seller.tagline ? (
          <p className="text-ink mx-auto max-w-xl text-sm leading-relaxed sm:mx-0">{seller.tagline}</p>
        ) : null}

        {settings.location || settings.ratingSummary ? (
          <p className="text-muted mt-1.5 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 text-xs sm:justify-start">
            {settings.location ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="size-3.5" aria-hidden />
                {seller.kyc.registeredAddress.city}
              </span>
            ) : null}
            {settings.ratingSummary ? (
              <span className="inline-flex items-center gap-1">
                <Star className="size-3.5 fill-amber-500 text-amber-500" aria-hidden />
                {seller.rating.count
                  ? `${seller.rating.average} · ${formatCompactNumber(seller.rating.count)} ratings`
                  : 'New to reviews'}
              </span>
            ) : null}
          </p>
        ) : null}

        {settings.policies ? (
          <p className="text-muted mt-1 text-xs">
            {seller.policies.returnWindowDays}-day returns
            {seller.policies.codEnabled ? ' · Cash on delivery' : ''}
          </p>
        ) : null}

        {chat || settings.shareButton ? (
          <div className="mt-4 flex items-center justify-center gap-2 sm:justify-start">
            {chat ? (
              <a
                href={chat}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-[#1f9d55] px-5 text-sm font-semibold text-white sm:flex-none"
              >
                <MessageCircle className="size-4" aria-hidden />
                Message on WhatsApp
              </a>
            ) : null}
            {settings.shareButton ? (
              <ShareMenu title={seller.displayName} path={`/store/${seller.slug}`} showWhatsApp />
            ) : null}
          </div>
        ) : null}

        {settings.about && seller.about ? (
          <details className="border-line mt-4 border-t pt-3 text-left">
            <summary className="text-ink cursor-pointer py-1 text-sm font-medium">About the store</summary>
            <p className="text-muted mt-2 text-sm leading-relaxed break-words">{seller.about}</p>
          </details>
        ) : null}
      </div>
    </header>
  );
}
