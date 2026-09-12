import { Heart, LayoutDashboard, ShoppingBag, Store, User } from 'lucide-react';
import Link from 'next/link';
import { Suspense } from 'react';

import { ThemeToggleCompact } from '@/components/theme/theme-toggle';
import { CountBubble } from '@/components/ui/badge';
import { Marquee } from '@/components/ui/marquee';
import { cn } from '@/lib/cn';
import { currentOwner, getSessionUser } from '@/server/auth/session';
import { getBagCount } from '@/server/services/cart';
import { getMegaMenu } from '@/server/services/catalog';
import { getSiteContent } from '@/server/services/site-content';
import { getWishlistCount } from '@/server/services/wishlist';
import { workspacesFor } from '@/server/services/workspaces';
import { DEFAULT_SITE_CONTENT } from '@/domain/site-content';

import { AccountMenu } from './account-menu';
import { HeaderShell } from './header-shell';
import { MegaMenu } from './mega-menu';
import { MobileNav } from './mobile-nav';
import { HeaderSearch } from './search-overlay';
import { Wordmark } from './wordmark';

/**
 * Storefront header.
 *
 * A Server Component, and the split inside it is the whole Cache Components
 * story in miniature:
 *
 *   - the brand, the mega menu and the icon rail are catalogue-shaped, so they
 *     prerender into the static shell and are served from the CDN;
 *   - the bag and wishlist counts are per-visitor, so they sit behind their own
 *     `<Suspense>` and stream in at request time;
 *   - the scroll behaviour is three lines of client state in `HeaderShell`,
 *     which WRAPS all of the above rather than containing a copy of it.
 *
 * Without that split, reading the bag count would make every page in the shop
 * dynamic — the header is on all of them.
 *
 * THE LAYOUT
 *
 *   ┌ announcement strip — a marquee of the three site-wide promises ────────┐
 *   ├ menu · wordmark ──────── departments ──────── search · theme · you ────┤
 *
 * The strip scrolls away with the page and the bar stays. Both live inside one
 * sticky element that moves as a unit; see `HeaderShell` for why that is one
 * transform rather than a collapsing height.
 */

/**
 * Every icon control in the header, defined once.
 *
 * 44x44, not 40. `size-10` is 40px, which is under the touch minimum. `shrink-0`
 * is the other half of the fix: without it a flex child gives up its WIDTH to
 * its neighbours long before it gives up its height, so the control stays 44px
 * tall while being squeezed to 20px wide — which passes a height check and
 * fails a thumb completely.
 */
const ICON_BUTTON = [
  'relative flex size-11 shrink-0 items-center justify-center rounded-full',
  'text-muted hover:bg-sunken hover:text-ink',
  'transition-[background-color,color,transform] duration-(--duration-base) ease-(--ease-out)',
  'motion-safe:active:scale-90',
].join(' ');

/**
 * The strip's words are DATA.
 *
 * "Free delivery above ₹1,199" is a commercial decision that changes without a
 * deploy, and a threshold here that disagrees with the one at checkout is worse
 * than no promise at all. Edited under Appearance; what the shop ships with
 * lives in `domain/site-content`.
 */
function AnnouncementStrip({ items }: { items: string[] }) {
  return (
    <div
      className={cn(
        'h-(--spacing-announce) overflow-hidden',
        'flex items-center text-2xs font-medium tracking-[0.04em]',
        /*
          A dark band on a light page — and a DARKER band on a dark page, not an
          inverted one.

          `bg-inverse` alone is the obvious choice and it is wrong after dark:
          `--surface-inverse` flips to near-white, so the strip became a bright
          white bar pinned across the top of every dark screen. That is the
          single most uncomfortable thing a dark theme can do, and it is exactly
          what someone turned dark mode on to avoid. This is one of the very few
          places the `dark:` variant earns its keep: the strip is not a surface
          in the token system's sense, it is a band that must recede in both
          themes, and no single semantic token means that.
        */
        'bg-inverse text-on-inverse',
        'dark:bg-sunken dark:text-muted dark:border-line dark:border-b',
      )}
    >
      <Marquee items={items} speed={46} staticFrom="md" />
    </div>
  );
}

/**
 * The bar's frame.
 *
 * Shared with `SiteHeaderFallback`, so the streaming placeholder is the SAME
 * geometry as the real thing rather than a hardcoded height sitting next to it.
 * Reserving the height by hand is right for one combination of strip and row
 * and silently wrong for every other — exactly the drift a shared frame exists
 * to prevent.
 */
function HeaderBar({ children }: { children?: React.ReactNode }) {
  return (
    <div className="glass">
      <div
        className={cn(
          'shell-max gutter flex items-center gap-2',
          'h-(--spacing-header) lg:h-(--spacing-header-lg) lg:gap-6',
        )}
      >
        {children}
      </div>
    </div>
  );
}

/**
 * What the shell paints while the taxonomy is still being read.
 *
 * The strip and the row are present and exactly the right height; only the
 * row's contents are missing. Nothing moves when the real header lands.
 */
export function SiteHeaderFallback() {
  return (
    <HeaderShell>
      {/*
        The defaults, not the edited copy: this is the placeholder that ships
        inside the static shell, and reading the database here would make the
        whole header dynamic for the sake of a band that is about to be
        replaced.
      */}
      <AnnouncementStrip items={DEFAULT_STRIP} />
      <HeaderBar />
    </HeaderShell>
  );
}

const DEFAULT_STRIP = DEFAULT_SITE_CONTENT.announcements
  .filter((item) => item.isActive)
  .map((item) => item.text);

export async function SiteHeader() {
  const [menu, content] = await Promise.all([getMegaMenu(), getSiteContent()]);
  const { headerActions } = content;

  const quickLinks = menu.map(({ department }) => ({
    label: department.name,
    href: `/category/${department.slug}`,
  }));

  return (
    <HeaderShell>
      <AnnouncementStrip
        items={content.announcements.filter((item) => item.isActive).map((item) => item.text)}
      />

      <HeaderBar>
        <MobileNav
          menu={menu}
          showWishlist={headerActions.wishlist}
          accountSlot={
            <Suspense fallback={null}>
              <MobileWorkspaces />
            </Suspense>
          }
        />

        <Link
          href="/"
          className="flex min-h-11 shrink-0 items-center rounded-md pr-1"
          aria-label="VestraWAB home"
        >
          <Wordmark />
        </Link>

        <MegaMenu menu={menu} />

        <div className="ml-auto flex items-center gap-0.5 lg:gap-1">
          {/* Two triggers — a phone icon and a desktop field — over one overlay. */}
          {headerActions.search ? <HeaderSearch quickLinks={quickLinks} /> : null}

          {/*
            Desktop only, and deliberately.

            The bottom bar already carries Home, Shop, Saved, Bag and Account on
            every storefront page, within thumb reach. Repeating four of them at
            the least reachable corner of the phone buys nothing and costs the
            header its width: at 320px five icons squeeze the hamburger to half
            its size, because a flex child with no `shrink-0` gives up its width
            before its neighbours do. Counts still stream; they stream into the
            bottom bar.
          */}
          <div className="ml-1 hidden items-center gap-0.5 lg:flex">
            <ThemeToggleCompact />

            <Suspense
              fallback={
                <span className={ICON_BUTTON} aria-hidden>
                  <User className="size-[1.15rem]" />
                </span>
              }
            >
              <HeaderAccount />
            </Suspense>

            {headerActions.wishlist ? (
              <Suspense fallback={<CountIconFallback label="Wishlist" icon="heart" />}>
                <WishlistIcon />
              </Suspense>
            ) : null}

            {headerActions.bag ? (
              <Suspense fallback={<CountIconFallback label="Bag" icon="bag" />}>
                <BagIcon />
              </Suspense>
            ) : null}
          </div>
        </div>
      </HeaderBar>
    </HeaderShell>
  );
}

/**
 * The static placeholder the shell ships with.
 *
 * Renders the icon at its final size with no number, so when the real count
 * streams in only the badge appears — the icon itself never moves.
 */
function CountIconFallback({ label, icon }: { label: string; icon: 'heart' | 'bag' }) {
  const Icon = icon === 'heart' ? Heart : ShoppingBag;
  return (
    <span className={ICON_BUTTON} aria-label={label}>
      <Icon className="size-[1.15rem]" aria-hidden />
    </span>
  );
}

async function WishlistIcon() {
  const count = await getWishlistCount(await currentOwner());
  return (
    <Link
      href="/wishlist"
      className={ICON_BUTTON}
      aria-label={count > 0 ? `Wishlist, ${count} items` : 'Wishlist'}
    >
      <Heart className="size-[1.15rem]" aria-hidden />
      <CountBubble count={count} className="absolute right-1 top-1" aria-hidden />
    </Link>
  );
}

async function BagIcon() {
  const count = await getBagCount(await currentOwner());
  return (
    <Link
      href="/bag"
      className={ICON_BUTTON}
      aria-label={count > 0 ? `Bag, ${count} items` : 'Bag'}
    >
      <ShoppingBag className="size-[1.15rem]" aria-hidden />
      <CountBubble count={count} className="absolute right-1 top-1" aria-hidden />
    </Link>
  );
}

/**
 * The account entry: a sign-in link for a visitor, and for a signed-in person
 * a menu with their role and the consoles they can work in. Per-visitor, so it
 * streams like the counts beside it and the header stays in the static shell.
 */
async function HeaderAccount() {
  const user = await getSessionUser();
  if (!user) {
    return (
      <Link href="/login" className={ICON_BUTTON} aria-label="Sign in">
        <User className="size-[1.15rem]" aria-hidden />
      </Link>
    );
  }

  const { chips, workspaces } = await workspacesFor(user);
  return (
    <AccountMenu
      name={user.fullName}
      email={user.email}
      avatarUrl={user.avatarUrl}
      chips={chips}
      workspaces={workspaces}
    />
  );
}

/** The same consoles, at the top of the phone menu's account links. */
async function MobileWorkspaces() {
  const user = await getSessionUser();
  if (!user) return null;

  const { workspaces } = await workspacesFor(user);
  if (workspaces.length === 0) return null;

  return (
    <div className="border-line mb-1 border-b pb-1">
      <p className="text-faint px-3 pb-1 pt-1.5 text-2xs font-semibold uppercase tracking-wider">
        Your workspaces
      </p>
      {workspaces.map((workspace) => (
        <a
          key={workspace.href}
          href={workspace.href}
          className="text-ink active:bg-sunken flex min-h-12 items-center gap-3 rounded-md px-3 text-sm font-medium"
        >
          {workspace.kind === 'admin' ? (
            <LayoutDashboard className="text-accent-ink size-4 shrink-0" aria-hidden />
          ) : (
            <Store className="text-accent-ink size-4 shrink-0" aria-hidden />
          )}
          <span className="min-w-0 flex-1">
            <span className="block">{workspace.label}</span>
            <span className="text-faint block truncate text-2xs font-normal">{workspace.description}</span>
          </span>
        </a>
      ))}
    </div>
  );
}
