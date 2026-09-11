import {
  ArrowUpRight,
  BadgeCheck,
  Facebook,
  Instagram,
  LifeBuoy,
  Linkedin,
  Mail,
  Phone,
  RotateCcw,
  ShieldCheck,
  Youtube,
} from 'lucide-react';
import { cacheLife, cacheTag } from 'next/cache';
import Link from 'next/link';

import { BrandLockup } from '@/components/layout/wordmark';
import { cn } from '@/lib/cn';
import { siteConfig } from '@/config/site';
import { getDepartments, listBrands } from '@/server/services/catalog';
import { tags } from '@/server/services/cache-tags';

/**
 * Storefront footer.
 *
 * Doubles as the site's internal-linking surface: departments and brands are
 * rendered from live data rather than a hardcoded list, so every category and
 * label a crawler needs is reachable from any page without a sitemap fetch.
 * That is also why it is a Server Component with real links rather than an
 * accordion that hides its hrefs behind JavaScript.
 *
 * THE SHAPE
 *
 *   ┌ brand · what this is · how to reach a human ──── social ──────────────┐
 *   ├ Shop ────── Help ────── Company ────── Legal ──── contact card ───────┤
 *   ├ labels on VestraWAB, as a flat link cloud ────────────────────────────┤
 *   └ © · registered office · GST note ─────────────────────────────────────┘
 *
 * The brand block at the top rather than a copyright line at the bottom is the
 * whole change from the previous footer: the last thing on every page used to
 * be a list of links belonging to nobody in particular. A footer is the last
 * impression, and on a marketplace it is also where trust is either established
 * or quietly missing.
 */

/**
 * Accepted payment methods, in the order an Indian shopper looks for them.
 *
 * UPI first because it is how most of this traffic actually pays, and cash on
 * delivery last because it is the fallback that removes the final objection.
 */
const PAYMENT_METHODS = [
  'UPI',
  'Visa',
  'Mastercard',
  'RuPay',
  'Net banking',
  'Wallets',
  'Cash on delivery',
] as const;

/** The three promises worth repeating at the point of leaving. */
const GUARANTEES = [
  { label: 'Secure checkout', icon: ShieldCheck },
  { label: '14-day returns', icon: RotateCcw },
  { label: 'GST-verified sellers', icon: BadgeCheck },
] as const;

/**
 * Only the accounts that have a glyph worth showing (X has no Lucide icon),
 * and only the ones configured: a link to a handle the shop does not own sends
 * people to somebody else.
 */
const SOCIAL = [
  { label: 'Instagram', href: siteConfig.social.instagram, icon: Instagram },
  { label: 'Facebook', href: siteConfig.social.facebook, icon: Facebook },
  { label: 'YouTube', href: siteConfig.social.youtube, icon: Youtube },
  { label: 'LinkedIn', href: siteConfig.social.linkedin, icon: Linkedin },
].flatMap((account) => (account.href ? [{ ...account, href: account.href }] : []));

export async function SiteFooter() {
  /*
   * Cached as a unit. Everything here is catalogue- or config-shaped, nothing
   * is per-visitor — and under Cache Components an uncached scope may not read
   * an unstable value like `new Date()`, which the copyright line needs.
   * Caching the whole component makes the year a prerendered value rather than
   * a request-time one.
   */
  'use cache';
  cacheTag(tags.taxonomy, tags.brandList);
  cacheLife('days');

  const [departments, brands] = await Promise.all([getDepartments(), listBrands(16)]);
  const year = new Date().getFullYear();

  const help = [
    { href: '/help/contact', label: 'Contact us' },
    { href: '/help/shipping', label: 'Shipping & delivery' },
    { href: '/help/returns', label: 'Returns & exchanges' },
    { href: '/help/refunds', label: 'Refunds' },
    { href: '/help/size-guide', label: 'Size guide' },
    { href: '/orders', label: 'Track your order' },
  ];

  const company = [
    { href: '/about', label: 'About VestraWAB' },
    { href: '/sell-with-us', label: 'Sell on VestraWAB' },
    { href: '/stores', label: 'Our sellers' },
    { href: '/brands', label: 'All brands' },
  ];

  const legal = [
    { href: '/legal/terms', label: 'Terms of use' },
    { href: '/legal/privacy', label: 'Privacy policy' },
    { href: '/legal/returns-policy', label: 'Return policy' },
    { href: '/legal/grievance', label: 'Grievance redressal' },
  ];

  return (
    <footer className="bg-sunken border-line mt-20 border-t">
      <div className="shell-max gutter py-14 sm:py-16">
        {/* ------------------------------------------------- brand + social */}
        <div className="border-line flex flex-col gap-8 border-b pb-10 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-md">
            <BrandLockup size="lg" />
            <p className="text-muted mt-4 text-sm">{siteConfig.description}</p>
          </div>

          {SOCIAL.length > 0 ? (
            <div className="lg:text-right">
              <h2 className="eyebrow">Follow along</h2>
              <ul className="mt-3 flex items-center gap-1.5 lg:justify-end">
                {SOCIAL.map((account) => (
                  <li key={account.label}>
                    <a
                      href={account.href}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`${siteConfig.name} on ${account.label}`}
                      className={cn(
                        'border-line bg-raised text-muted flex size-11 items-center justify-center',
                        'rounded-full border transition-[color,border-color,transform]',
                        'duration-(--duration-base) ease-(--ease-out)',
                        'hover:text-accent-ink hover:border-accent-control',
                        'motion-safe:hover:-translate-y-0.5 motion-safe:active:translate-y-0',
                      )}
                    >
                      <account.icon className="size-[1.1rem]" aria-hidden />
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>

        {/* -------------------------------------------------------- columns */}
        <div className="mt-12 grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-4 lg:grid-cols-6">
          <FooterColumn title="Shop">
            {departments.map((department) => (
              <FooterLink key={department.id} href={`/category/${department.slug}`}>
                {department.name}
              </FooterLink>
            ))}
          </FooterColumn>

          <FooterColumn title="Help">
            {help.map((link) => (
              <FooterLink key={link.href} href={link.href}>
                {link.label}
              </FooterLink>
            ))}
          </FooterColumn>

          <FooterColumn title="Company">
            {company.map((link) => (
              <FooterLink key={link.href} href={link.href}>
                {link.label}
              </FooterLink>
            ))}
          </FooterColumn>

          <FooterColumn title="Legal">
            {legal.map((link) => (
              <FooterLink key={link.href} href={link.href}>
                {link.label}
              </FooterLink>
            ))}
          </FooterColumn>

          {/*
            The contact card.

            A card rather than a fifth column of links, because it is the one
            block here that is an OFFER rather than a list — and because a phone
            number set as body text in a column of navigation is a phone number
            nobody sees.
          */}
          <div className="border-line bg-raised col-span-2 rounded-xl border p-5 lg:col-span-2">
            <h2 className="text-ink text-sm font-semibold">Talk to a human</h2>
            {siteConfig.supportHours ? (
              <p className="text-faint mt-1 text-xs">{siteConfig.supportHours}</p>
            ) : null}

            <address className="mt-4 space-y-1.5 not-italic">
              {siteConfig.supportEmail ? (
                <a
                  href={`mailto:${siteConfig.supportEmail}`}
                  className="text-muted hover:text-accent-ink flex min-h-11 items-center gap-2.5 text-sm transition-colors sm:min-h-0"
                >
                  <Mail className="size-4 shrink-0 opacity-60" aria-hidden />
                  {siteConfig.supportEmail}
                </a>
              ) : null}
              {siteConfig.supportPhone ? (
                <a
                  href={`tel:${siteConfig.supportPhone.replace(/\s/g, '')}`}
                  className="text-muted hover:text-accent-ink flex min-h-11 items-center gap-2.5 text-sm transition-colors sm:min-h-0"
                >
                  <Phone className="size-4 shrink-0 opacity-60" aria-hidden />
                  {siteConfig.supportPhone}
                </a>
              ) : null}
              {/* Always offered: a ticket reaches a person whether or not the rest is set. */}
              <Link
                href="/account/support"
                className="text-muted hover:text-accent-ink flex min-h-11 items-center gap-2.5 text-sm transition-colors sm:min-h-0"
              >
                <LifeBuoy className="size-4 shrink-0 opacity-60" aria-hidden />
                Raise a support ticket
              </Link>
            </address>

            <Link
              href="/sell-with-us"
              className="text-accent-ink group mt-5 inline-flex min-h-11 items-center gap-1.5 text-sm font-medium sm:min-h-0"
            >
              Sell on VestraWAB
              <ArrowUpRight
                className="size-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                aria-hidden
              />
            </Link>
          </div>
        </div>

        {/* ---------------------------------------------------- brand cloud */}
        <div className="border-line mt-12 border-t pt-7">
          <h2 className="eyebrow">Labels on VestraWAB</h2>
          <ul className="mt-3 flex flex-wrap gap-x-1 gap-y-0.5">
            {brands.map((brand) => (
              <li key={brand.id}>
                <Link
                  href={`/brand/${brand.slug}`}
                  className={cn(
                    'text-muted hover:bg-raised hover:text-ink inline-flex min-h-11 items-center',
                    'rounded-full px-3 text-xs transition-colors sm:min-h-8',
                  )}
                >
                  {brand.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        {/* ----------------------------------------------------- trust strip */}
        {/*
          Payment methods, set as TYPE rather than as logos.

          Reproducing card-network marks correctly means six licensed assets,
          each with its own clear-space rule and its own dark-theme variant, and
          a marketplace that gets one of them slightly wrong looks less
          trustworthy than one that never showed them. The names carry the same
          information — "can I pay the way I pay?" — and they re-colour with the
          theme for free.

          It sits directly above the colophon because this is the last thing
          read before leaving, and payment doubt is the last thing to remove.
        */}
        <div className="border-line mt-12 flex flex-col gap-4 border-t pt-7 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="eyebrow">Ways to pay</h2>
            <ul className="mt-3 flex flex-wrap items-center gap-1.5">
              {PAYMENT_METHODS.map((method) => (
                <li
                  key={method}
                  className={cn(
                    'border-line bg-raised text-muted rounded-md border px-2.5 py-1.5',
                    'text-2xs font-medium tracking-[0.02em]',
                  )}
                >
                  {method}
                </li>
              ))}
            </ul>
          </div>

          <ul className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {GUARANTEES.map((guarantee) => (
              <li key={guarantee.label} className="text-muted flex items-center gap-2 text-xs">
                <guarantee.icon className="text-accent-ink size-4 shrink-0" aria-hidden />
                {guarantee.label}
              </li>
            ))}
          </ul>
        </div>

        {/* --------------------------------------------------------- colophon */}
        <div className="border-line mt-10 flex flex-col gap-2 border-t pt-7 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-faint text-xs">
            © {year} {siteConfig.legalName}. All rights reserved.
            <span className="hidden sm:inline"> · {siteConfig.attribution}.</span>
          </p>
          <p className="text-faint text-xs">
            {siteConfig.address ? `${siteConfig.address} · ` : ''}All prices include GST
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="eyebrow">{title}</h2>
      <ul className="mt-3.5">{children}</ul>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      {/*
        `min-h-11` only while it matters.

        A footer link list is twenty rows deep, so 44px rows on the desktop
        would add a screen and a half of empty space to a surface nobody taps
        with a thumb. Below `sm` the target wins; above it, the density does.
      */}
      <Link
        href={href}
        className={cn(
          'text-muted hover:text-accent-ink flex min-h-11 items-center text-sm',
          'transition-colors duration-(--duration-base) ease-(--ease-out) sm:min-h-0 sm:py-1.5',
        )}
      >
        {children}
      </Link>
    </li>
  );
}
