import Link from 'next/link';
import { Suspense } from 'react';

import { Breadcrumbs } from '@/components/commerce/breadcrumbs';
import { Prose } from '@/components/cms/prose';
import { PageSections } from '@/components/home/page-sections';
import { siteConfig } from '@/config/site';
import type { CmsPage } from '@/domain/types';
import { formatDate } from '@/lib/format';
import { getPageSections } from '@/server/services/content';

/**
 * The shared shell for every policy and help page, so they cannot drift apart
 * in layout, breadcrumb shape or heading hierarchy.
 */
export function CmsPageView({
  page,
  breadcrumbs,
  contact,
}: {
  page: CmsPage;
  breadcrumbs: Array<{ href: string; label: string }>;
  /** Which contact details to set under the text, if any. */
  contact?: 'support' | 'grievance';
}) {
  return (
    <>
      <div className="gutter shell-max py-6">
        <Breadcrumbs items={breadcrumbs} />

        <article className="mt-4">
          <h1 className="font-display text-ink text-2xl sm:text-3xl">{page.title}</h1>
          <p className="text-faint mt-1.5 text-xs">
            Last updated <time dateTime={page.updatedAt}>{formatDate(page.updatedAt)}</time>
          </p>

          <div className="mt-6">
            <Prose markdown={page.body} />
          </div>

          {contact ? <ContactDetails kind={contact} /> : null}
        </article>
      </div>

      {/*
        Anything the page has been composed with, under its copy.

        A landing page is a page like any other: this is the same renderer the
        homepage uses, so a rail added to "Sell with us" behaves exactly as a
        rail added to the front page -- including its skeleton while it loads.
        Pages with nothing composed render nothing at all.
      */}
      <Suspense fallback={null}>
        <ComposedSections slug={page.slug} />
      </Suspense>
    </>
  );
}

async function ComposedSections({ slug }: { slug: string }) {
  const sections = await getPageSections(slug);
  if (sections.length === 0) return null;
  return <PageSections sections={sections} />;
}

/**
 * Contact details, from configuration rather than from the page text.
 *
 * The text is editable copy; who to write to is a fact about the business,
 * kept in one place (`siteConfig`, set from the environment) so it is the same
 * here, in the footer and in every email. Anything not configured is left out
 * rather than filled with a placeholder, and a ticket is always offered,
 * because it reaches a person whether or not the rest is set.
 */
function ContactDetails({ kind }: { kind: 'support' | 'grievance' }) {
  const rows: Array<{ label: string; value: string; href?: string }> = [];

  if (kind === 'grievance') {
    if (siteConfig.grievanceOfficer) rows.push({ label: 'Grievance officer', value: siteConfig.grievanceOfficer });
    rows.push({ label: 'Company', value: siteConfig.legalName });
    if (siteConfig.address) rows.push({ label: 'Address', value: siteConfig.address });
    if (siteConfig.grievanceEmail) {
      rows.push({ label: 'Email', value: siteConfig.grievanceEmail, href: `mailto:${siteConfig.grievanceEmail}` });
    }
  } else {
    if (siteConfig.supportEmail) {
      rows.push({ label: 'Email', value: siteConfig.supportEmail, href: `mailto:${siteConfig.supportEmail}` });
    }
    if (siteConfig.supportPhone) {
      rows.push({
        label: 'Phone',
        value: siteConfig.supportPhone,
        href: `tel:${siteConfig.supportPhone.replace(/\s/g, '')}`,
      });
    }
    if (siteConfig.supportHours) rows.push({ label: 'Hours', value: siteConfig.supportHours });
  }

  const officerNamed = Boolean(siteConfig.grievanceOfficer && siteConfig.grievanceEmail);

  return (
    <section
      aria-labelledby="contact-details"
      className="border-line bg-raised mt-8 max-w-2xl rounded-xl border p-5 sm:p-6"
    >
      <h2 id="contact-details" className="text-ink text-md font-semibold">
        {kind === 'grievance' ? 'Grievance officer' : 'Reach us'}
      </h2>

      {rows.length > 0 ? (
        <dl className="mt-4 grid gap-x-6 gap-y-2.5 sm:grid-cols-[9rem_minmax(0,1fr)]">
          {rows.map((row) => (
            <div key={row.label} className="contents">
              <dt className="text-faint text-xs sm:pt-0.5">{row.label}</dt>
              <dd className="text-ink text-sm">
                {row.href ? (
                  <a href={row.href} className="hover:text-accent-ink underline underline-offset-2">
                    {row.value}
                  </a>
                ) : (
                  row.value
                )}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      <p className="text-muted mt-4 text-sm">
        {kind === 'grievance' && !officerNamed
          ? 'To reach the grievance officer, raise a ticket and ask for it to be escalated: '
          : 'You can also raise a ticket, which keeps the conversation and the order it is about in one place: '}
        <Link href="/account/support" className="text-accent-ink underline underline-offset-2">
          your support tickets
        </Link>
        .
      </p>
    </section>
  );
}
