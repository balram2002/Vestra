import { cacheLife, cacheTag } from 'next/cache';
import Link from 'next/link';

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
 */
export async function SiteFooter() {
  /*
   * Cached as a unit. Everything here is catalogue- or config-shaped, nothing
   * is per-visitor — and under Cache Components an uncached scope may not read
   * an unstable value like `new Date()`, which the copyright line needs. Caching
   * the whole component makes the year a prerendered value rather than a
   * request-time one.
   */
  'use cache';
  cacheTag(tags.taxonomy, tags.brandList);
  cacheLife('days');

  const [departments, brands] = await Promise.all([getDepartments(), listBrands(14)]);
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
    { href: '/about', label: 'About Vestra' },
    { href: '/sell-with-us', label: 'Sell on Vestra' },
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
    <footer className="bg-sunken border-line mt-16 border-t">
      <div className="shell-max gutter py-12">
        <div className="grid grid-cols-2 gap-x-6 gap-y-9 md:grid-cols-4 lg:grid-cols-5">
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

          <div className="col-span-2 md:col-span-4 lg:col-span-1">
            <h2 className="text-ink text-xs font-semibold uppercase tracking-wider">
              Talk to a human
            </h2>
            <address className="text-muted mt-3 space-y-1 text-sm not-italic">
              <p>
                <a href={`mailto:${siteConfig.supportEmail}`} className="hover:text-accent-ink">
                  {siteConfig.supportEmail}
                </a>
              </p>
              <p>
                <a
                  href={`tel:${siteConfig.supportPhone.replace(/\s/g, '')}`}
                  className="hover:text-accent-ink"
                >
                  {siteConfig.supportPhone}
                </a>
              </p>
              <p className="text-faint text-xs">{siteConfig.supportHours}</p>
            </address>
          </div>
        </div>

        {/* Brand links: high-value internal links, kept out of the main columns. */}
        <div className="border-line mt-10 border-t pt-6">
          <h2 className="text-faint text-2xs font-semibold uppercase tracking-wider">
            Labels on Vestra
          </h2>
          <ul className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1.5">
            {brands.map((brand) => (
              <li key={brand.id}>
                <Link
                  href={`/brand/${brand.slug}`}
                  className="text-muted hover:text-accent-ink text-xs"
                >
                  {brand.name}
                </Link>
              </li>
            ))}
          </ul>
        </div>

        <div className="border-line mt-8 flex flex-col gap-3 border-t pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-faint text-xs">
            © {year} {siteConfig.legalName}. All rights reserved.
          </p>
          <p className="text-faint text-xs">
            {siteConfig.address.city}, {siteConfig.address.state} · Prices include GST
          </p>
        </div>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="text-ink text-xs font-semibold uppercase tracking-wider">{title}</h2>
      <ul className="mt-3 space-y-2">{children}</ul>
    </div>
  );
}

function FooterLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <Link href={href} className="text-muted hover:text-accent-ink text-sm transition-colors">
        {children}
      </Link>
    </li>
  );
}
