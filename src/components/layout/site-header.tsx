import { Heart, Search, ShoppingBag, User } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';

import { getMegaMenu } from '@/server/services/catalog';

import { MegaMenu } from './mega-menu';
import { MobileNav } from './mobile-nav';

/**
 * Storefront header.
 *
 * A Server Component, and the split inside it is the whole Cache Components
 * story in miniature:
 *
 *   - the brand, the mega menu and the icon rail are catalogue-shaped, so they
 *     prerender into the static shell and are served from the CDN;
 *   - the bag and wishlist counts are per-visitor, so they sit behind their own
 *     `<Suspense>` and stream in at request time.
 *
 * Without that split, reading the bag count would make every page in the shop
 * dynamic — the header is on all of them.
 */
export async function SiteHeader() {
  const menu = await getMegaMenu();

  return (
    <header className="bg-raised border-line sticky top-0 z-50 border-b">
      {/* Announcement strip: the one place site-wide promises are stated. */}
      <p className="bg-inverse text-on-inverse py-1.5 text-center text-2xs tracking-wide">
        Free delivery above ₹1,199 · 14-day returns · Verified sellers only
      </p>

      <div className="shell-max gutter flex h-[--spacing-header] items-center gap-3 lg:h-[--spacing-header-lg] lg:gap-6">
        <MobileNav menu={menu} />

        <Link href="/" className="shrink-0" aria-label="Vestra home">
          <span className="font-display text-ink text-2xl leading-none tracking-tight">
            Vestra
          </span>
        </Link>

        <MegaMenu menu={menu} />

        <div className="ml-auto flex items-center gap-1 lg:gap-2">
          <Link
            href="/search"
            className="text-muted hover:bg-sunken hover:text-ink flex size-10 items-center justify-center rounded-md transition-colors lg:hidden"
            aria-label="Search"
          >
            <Search className="size-5" />
          </Link>

          {/* Desktop gets a real input rather than an icon that opens one. */}
          <form action="/search" className="hidden lg:block">
            <div className="relative">
              <Search className="text-faint pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2" />
              <input
                type="search"
                name="q"
                placeholder="Search for kurtas, sneakers, brands…"
                aria-label="Search products"
                className="bg-sunken border-line text-ink placeholder:text-faint focus:border-accent-line focus:bg-raised h-10 w-56 rounded-md border pl-9 pr-3 text-sm transition-[width,background-color,border-color] duration-200 focus:w-80"
              />
            </div>
          </form>

          <Link
            href="/account"
            className="text-muted hover:bg-sunken hover:text-ink flex size-10 items-center justify-center rounded-md transition-colors"
            aria-label="Your account"
          >
            <User className="size-5" />
          </Link>

          <Suspense fallback={<CountIconFallback label="Wishlist" icon="heart" />}>
            <WishlistIcon />
          </Suspense>

          <Suspense fallback={<CountIconFallback label="Bag" icon="bag" />}>
            <BagIcon />
          </Suspense>
        </div>
      </div>
    </header>
  );
}

/**
 * The static placeholder the shell ships with.
 *
 * It renders the icon at its final size with no number, so when the real count
 * streams in only the badge appears — the icon itself never moves.
 */
function CountIconFallback({ label, icon }: { label: string; icon: 'heart' | 'bag' }) {
  const Icon = icon === 'heart' ? Heart : ShoppingBag;
  return (
    <span
      className="text-muted flex size-10 items-center justify-center rounded-md"
      aria-label={label}
    >
      <Icon className="size-5" />
    </span>
  );
}

/**
 * Per-visitor counts.
 *
 * These read the session, which is why they are separate components behind
 * Suspense rather than inline in the header. Wired to the real bag and wishlist
 * services in Phase 3; for now they render the resting state so the header is
 * complete and nothing is a dead control.
 */
async function WishlistIcon() {
  const count = 0;
  return (
    <Link
      href="/wishlist"
      className="text-muted hover:bg-sunken hover:text-ink relative flex size-10 items-center justify-center rounded-md transition-colors"
      aria-label={count > 0 ? `Wishlist, ${count} items` : 'Wishlist'}
    >
      <Heart className="size-5" />
      {count > 0 ? <CountBubble count={count} /> : null}
    </Link>
  );
}

async function BagIcon() {
  const count = 0;
  return (
    <Link
      href="/bag"
      className="text-muted hover:bg-sunken hover:text-ink relative flex size-10 items-center justify-center rounded-md transition-colors"
      aria-label={count > 0 ? `Bag, ${count} items` : 'Bag'}
    >
      <ShoppingBag className="size-5" />
      {count > 0 ? <CountBubble count={count} /> : null}
    </Link>
  );
}

function CountBubble({ count }: { count: number }) {
  return (
    <span className="bg-accent text-on-inverse tabular absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px] font-semibold">
      {count > 99 ? '99+' : count}
    </span>
  );
}
