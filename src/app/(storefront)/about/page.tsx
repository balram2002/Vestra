import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { CmsPageView } from '@/components/cms/cms-page-view';
import { absoluteUrl } from '@/config/site';
import { getCmsPage } from '@/server/services/content';

export async function generateMetadata(): Promise<Metadata> {
  const page = await getCmsPage('about');
  if (!page) return {};
  return {
    title: page.title,
    description: page.metaDescription ?? undefined,
    alternates: { canonical: absoluteUrl('/about') },
  };
}

export default async function AboutPage() {
  const page = await getCmsPage('about');
  if (!page) notFound();

  return (
    <CmsPageView
      page={page}
      breadcrumbs={[
        { href: '/', label: 'Home' },
        { href: '/about', label: page.title },
      ]}
    />
  );
}
