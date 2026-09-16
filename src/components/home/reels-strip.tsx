import { Play } from 'lucide-react';
import Link from 'next/link';

import { Picture } from '@/components/ui/picture';
import type { HomeSection } from '@/domain/types';
import { formatMoney } from '@/lib/format';
import { cn } from '@/lib/cn';
import { staggerIndex } from '@/lib/motion';
import type { ReelView } from '@/server/services/live';

import { Section } from './section';

/**
 * Reels, on the homepage.
 *
 * The shop's sellers shoot vertical clips of their own stock, and until now the
 * only way to those clips was a tab in the bottom bar. This row is the door:
 * poster frames at 9:16, the price on the card, and every tile opening the feed
 * itself rather than trying to be a second video player.
 *
 * NO AUTOPLAYING VIDEO HERE, deliberately. Six muted clips playing behind the
 * fold is six decoders, a flat battery and somebody's data -- and the feed one
 * tap away does it properly, one at a time, with sound the shopper asked for.
 * The poster is what sells the tap.
 */
export function ReelsStrip({ section, reels }: { section: HomeSection; reels: ReelView[] }) {
  if (reels.length === 0) return null;

  return (
    <Section
      title={section.title}
      subtitle={section.subtitle}
      href={section.href ?? '/reels'}
      ctaLabel={section.ctaLabel ?? 'Watch all'}
      flush
    >
      <ul
        className={cn(
          'no-scrollbar stagger gutter shell-max flex snap-x snap-mandatory gap-3 overflow-x-auto',
          'sm:gap-4',
        )}
      >
        {reels.slice(0, 10).map((reel, index) => (
          <li
            key={reel.id}
            className="w-40 shrink-0 snap-start sm:w-48"
            style={staggerIndex(index)}
          >
            <Link href={reel.demoPath} className="group block">
              <div className="relative">
                <Picture
                  src={reel.posterUrl}
                  name={reel.productTitle}
                  sizes="(max-width: 40rem) 10rem, 12rem"
                  className="aspect-9/16 rounded-xl ring-1 ring-inset ring-black/[0.07]"
                  imageClassName="transition-transform duration-(--duration-hero) ease-out motion-safe:group-hover:scale-[1.05]"
                />

                {/* The affordance, not decoration: a poster with no play mark
                    is a photograph, and nobody taps a photograph expecting video. */}
                <span
                  aria-hidden
                  className={cn(
                    'absolute inset-0 grid place-items-center rounded-xl',
                    'bg-gradient-to-t from-black/45 via-transparent to-transparent',
                  )}
                >
                  <span className="grid size-10 place-items-center rounded-full bg-white/90 text-black shadow-sm transition-transform duration-(--duration-base) group-hover:scale-110">
                    <Play className="size-4 fill-current" />
                  </span>
                </span>

                {reel.sellerIsLive ? (
                  <span className="bg-danger-600 absolute left-2 top-2 rounded-full px-1.5 py-0.5 text-3xs font-semibold uppercase tracking-wide text-white">
                    Live
                  </span>
                ) : null}
              </div>

              <p className="text-ink mt-2 truncate text-xs font-medium">{reel.productTitle}</p>
              <p className="text-faint truncate text-2xs">
                {formatMoney(reel.sellingPrice)} · {reel.sellerName}
              </p>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  );
}
