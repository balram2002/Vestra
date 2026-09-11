import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { CmsPageForm } from '@/components/console/cms-page-form';
import { PageHeader } from '@/components/console/page-header';
import { siteConfig } from '@/config/site';
import { formatDateTime } from '@/lib/format';
import { requirePermission } from '@/server/auth/session';
import { collections, toEntity } from '@/server/db/collections';

export const metadata: Metadata = { title: 'Edit page' };

export default function AdminPageEditor({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="skeleton h-96 rounded-lg" aria-hidden />}>
      <Editor params={params} />
    </Suspense>
  );
}

async function Editor({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }] = await Promise.all([params, requirePermission('cms:write')]);

  const pages = await collections.cmsPages();
  const page = toEntity(await pages.findOne({ _id: id }));
  if (!page) notFound();

  const contact =
    page.slug === 'legal/grievance' ? 'grievance' : page.slug === 'help/contact' ? 'support' : null;

  return (
    <>
      <PageHeader
        back={{ href: '/admin/pages', label: 'All pages' }}
        title={page.title}
        description={
          <>
            <Link
              href={`/${page.slug}`}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2"
            >
              /{page.slug}
            </Link>{' '}
            · last saved {formatDateTime(page.updatedAt)}
          </>
        }
      />

      {contact ? <ContactSettings kind={contact} /> : null}

      <CmsPageForm
        page={{
          id: page.id,
          slug: page.slug,
          title: page.title,
          metaDescription: page.metaDescription,
          body: page.body,
          isPublished: page.isPublished,
        }}
      />
    </>
  );
}

/**
 * What the block under this page shows, and which setting fills each line.
 *
 * The details are not in the text on purpose, so the editor says where they
 * come from instead of leaving someone to wonder why editing the page does
 * not change the phone number.
 */
function ContactSettings({ kind }: { kind: 'support' | 'grievance' }) {
  const rows: Array<[label: string, value: string | null, key: string]> =
    kind === 'grievance'
      ? [
          ['Grievance officer', siteConfig.grievanceOfficer, 'NEXT_PUBLIC_GRIEVANCE_OFFICER'],
          ['Company', siteConfig.legalName, 'NEXT_PUBLIC_LEGAL_NAME'],
          ['Address', siteConfig.address, 'NEXT_PUBLIC_BUSINESS_ADDRESS'],
          ['Email', siteConfig.grievanceEmail, 'NEXT_PUBLIC_GRIEVANCE_EMAIL'],
        ]
      : [
          ['Email', siteConfig.supportEmail, 'NEXT_PUBLIC_SUPPORT_EMAIL'],
          ['Phone', siteConfig.supportPhone, 'NEXT_PUBLIC_SUPPORT_PHONE'],
          ['Hours', siteConfig.supportHours, 'NEXT_PUBLIC_SUPPORT_HOURS'],
        ];

  return (
    <section className="border-line bg-raised mt-6 max-w-3xl rounded-lg border p-4">
      <h2 className="text-ink text-sm font-semibold">Contact details shown under this page</h2>
      <p className="text-muted mt-1 text-xs">
        These come from your host&apos;s environment variables, not from the text below, so they
        match the footer and every email. Change them there, then redeploy.
      </p>
      <dl className="mt-3 grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-[9rem_minmax(0,1fr)]">
        {rows.map(([label, value, key]) => (
          <div key={key} className="contents">
            <dt className="text-faint">{label}</dt>
            <dd className={value ? 'text-ink' : 'text-warning-700'}>
              {value ?? (
                <>
                  Not set <span className="text-faint font-mono">({key})</span>
                </>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
