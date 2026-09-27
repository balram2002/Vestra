import type { Metadata } from 'next';
import { Suspense } from 'react';

import { PageChromeEditor } from '@/components/console/page-chrome-editor';
import { PageHeader } from '@/components/console/page-header';
import { requirePermission } from '@/server/auth/session';
import { getSiteContent } from '@/server/services/site-content';

export const metadata: Metadata = { title: 'Page layout' };

/**
 * Header, footer, promotion strip and bottom bar, page by page.
 *
 * What those pieces SAY is edited under Appearance; this is only whether each
 * page wears them.
 */
export default function AdminPageChromePage() {
  return (
    <>
      <PageHeader
        title="Page layout"
        description="Choose, for every kind of page in the shop, whether it shows the header, the footer, the promotion strip and the phone bottom bar."
      />

      <Suspense fallback={<div className="skeleton mt-6 h-[36rem] rounded-lg" aria-hidden />}>
        <Editor />
      </Suspense>
    </>
  );
}

async function Editor() {
  await requirePermission('cms:write');
  const { pageChrome } = await getSiteContent();
  // Keyed on the rules, so a put-back from History remounts with the restored table.
  return <PageChromeEditor key={JSON.stringify(pageChrome)} initial={pageChrome} />;
}
