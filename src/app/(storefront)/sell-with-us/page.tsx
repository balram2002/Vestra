import type { Metadata } from 'next';
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
    <CmsPageView
      page={page}
      breadcrumbs={[
        { href: '/', label: 'Home' },
        { href: '/sell-with-us', label: page.title },
      ]}
    />
  );
}
