import Link from 'next/link';
import { Suspense } from 'react';

import { Breadcrumbs } from '@/components/commerce/breadcrumbs';
import { Prose } from '@/components/cms/prose';
import { Picture } from '@/components/ui/picture';
import { PageSections } from '@/components/home/page-sections';
import { siteConfig } from '@/config/site';
import { outlineOf, readingMinutes } from '@/domain/content-pages';
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
  const template = page.template ?? 'PLAIN';

  return (
    <>
      {template === 'EDITORIAL' ? (
        <EditorialArticle page={page} breadcrumbs={breadcrumbs} contact={contact} />
      ) : template === 'HELP' ? (
        <HelpArticle page={page} breadcrumbs={breadcrumbs} contact={contact} />
      ) : (
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
      )}

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

type ArticleProps = {
  page: CmsPage;
  breadcrumbs: Array<{ href: string; label: string }>;
  contact?: 'support' | 'grievance';
};

/**
 * Template 2 -- Editorial. For the pages that sell the shop rather than bind
 * it: a full-width image, the title set large, a standfirst, and text held to
 * a comfortable reading measure.
 */
function EditorialArticle({ page, breadcrumbs, contact }: ArticleProps) {
  const minutes = readingMinutes(page.body);
  return (
    <article>
      {page.heroImageUrl ? (
        <div className="relative h-56 overflow-hidden sm:h-80 lg:h-[26rem]">
          <Picture src={page.heroImageUrl} name={page.title} sizes="100vw" className="absolute inset-0" priority />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/45 via-black/10 to-transparent" />
        </div>
      ) : null}

      <div className="gutter mx-auto max-w-3xl py-8 sm:py-12">
        <Breadcrumbs items={breadcrumbs} />
        <h1 className="font-display text-ink mt-4 text-3xl leading-tight sm:text-5xl">{page.title}</h1>
        {page.summary ? <p className="text-muted mt-4 text-lg leading-relaxed sm:text-xl">{page.summary}</p> : null}
        <p className="text-faint border-line mt-6 flex flex-wrap gap-x-4 border-b pb-6 text-xs">
          <span>{minutes} min read</span>
          <span>
            Updated <time dateTime={page.updatedAt}>{formatDate(page.updatedAt)}</time>
          </span>
        </p>
        <div className="mt-8 text-base leading-7 [&_p]:leading-7">
          <Prose markdown={page.body} />
        </div>
        {contact ? <ContactDetails kind={contact} /> : null}
      </div>
    </article>
  );
}

/**
 * Template 3 -- Help article. A contents list built from the page's own
 * headings sits beside the text on a wide screen and folds above it on a
 * phone, and anyone who reaches the end still stuck is routed to a person.
 */
function HelpArticle({ page, breadcrumbs, contact }: ArticleProps) {
  const outline = outlineOf(page.body);
  return (
    <div className="gutter shell-max py-6">
      <Breadcrumbs items={breadcrumbs} />
      <div className="mt-4 grid gap-8 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-12">
        {outline.length > 1 ? (
          <nav aria-label="On this page" className="lg:sticky lg:top-24 lg:self-start">
            <details open className="border-line bg-raised rounded-xl border p-4 lg:border-0 lg:bg-transparent lg:p-0">
              <summary className="text-faint cursor-pointer text-2xs font-semibold uppercase tracking-wider lg:cursor-default">
                On this page
              </summary>
              <ol className="border-line mt-3 space-y-1 border-l">
                {outline.map((item) => (
                  <li key={item.anchor}>
                    <a
                      href={`#${item.anchor}`}
                      className="text-muted hover:text-ink hover:border-ink -ml-px block border-l border-transparent py-1 pl-3 text-sm"
                    >
                      {item.text}
                    </a>
                  </li>
                ))}
              </ol>
            </details>
          </nav>
        ) : (
          <span className="hidden lg:block" />
        )}

        <article className="min-w-0 max-w-3xl">
          <p className="text-accent-ink text-2xs font-semibold uppercase tracking-wider">Help centre</p>
          <h1 className="font-display text-ink mt-1 text-2xl sm:text-3xl">{page.title}</h1>
          {page.summary ? <p className="text-muted mt-2 text-sm leading-relaxed sm:text-base">{page.summary}</p> : null}
          <p className="text-faint mt-1.5 text-xs">
            Last updated <time dateTime={page.updatedAt}>{formatDate(page.updatedAt)}</time>
          </p>
          <div className="mt-6">
            <Prose markdown={page.body} />
          </div>
          {contact ? (
            <ContactDetails kind={contact} />
          ) : (
            <aside className="border-line bg-raised mt-10 flex flex-wrap items-center justify-between gap-4 rounded-xl border p-5">
              <div>
                <p className="text-ink text-sm font-semibold">Still stuck?</p>
                <p className="text-muted mt-0.5 text-sm">A person reads every ticket, with your order beside it.</p>
              </div>
              <Link href="/account/support" className="bg-ink text-canvas inline-flex min-h-11 items-center rounded-full px-5 text-sm font-medium">
                Ask support
              </Link>
            </aside>
          )}
        </article>
      </div>
    </div>
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
