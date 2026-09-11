import type { Metadata } from 'next';
import { Button } from '@/components/ui/button';
import Link from 'next/link';
import { notFound } from 'next/navigation';

import { CmsPageView } from '@/components/cms/cms-page-view';
import { absoluteUrl } from '@/config/site';
import { getCmsPage } from '@/server/services/content';

export async function generateMetadata(): Promise<Metadata> {
  const page = await getCmsPage('sell-with-us');
  if (!page) return {};
  return {
    title: page.title,
    description: page.metaDescription ?? undefined,
    alternates: { canonical: absoluteUrl('/sell-with-us') },
  };
}

export default async function SellWithUsPage() {
  const page = await getCmsPage('sell-with-us');
  if (!page) notFound();

  return (
    <>
      <CmsPageView
        page={page}
        breadcrumbs={[
          { href: '/', label: 'Home' },
          { href: '/sell-with-us', label: page.title },
        ]}
      />

      {/*
        The call to action lives in the page rather than in the CMS body,
        because a marketing page whose only route forward is a link somebody
        remembered to type into markdown is one edit away from a dead end.
      */}
      <div className="gutter shell-max pb-16">
        <div className="border-accent-border bg-accent-soft flex flex-wrap items-center justify-between gap-4 rounded-lg border p-6">
          <div>
            <h2 className="font-display text-ink text-lg">Ready to open your store?</h2>
            <p className="text-muted mt-1 text-sm">
              About fifteen minutes, if you have your GSTIN and bank details to hand.
            </p>
          </div>
          <Button asChild size="lg" className="shrink-0">
            <Link href="/sell-with-us/apply">Start your application</Link>
          </Button>
        </div>
      </div>
    </>
  );
}
