import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { CmsPageView } from '@/components/cms/cms-page-view';
import { absoluteUrl } from '@/config/site';
import { getCmsPage, listCmsPages } from '@/server/services/content';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const pages = await listCmsPages('help');
  return pages.map((page) => ({ slug: page.slug.replace('help/', '') }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = await getCmsPage(`help/${slug}`);
  if (!page) return {};

  return {
    title: page.title,
    description: page.metaDescription ?? undefined,
    alternates: { canonical: absoluteUrl(`/help/${slug}`) },
  };
}

export default async function HelpPage({ params }: PageProps) {
  const { slug } = await params;
  const page = await getCmsPage(`help/${slug}`);
  if (!page) notFound();

  return (
    <CmsPageView
      page={page}
      breadcrumbs={[
        { href: '/', label: 'Home' },
        { href: `/help/${slug}`, label: page.title },
      ]}
    />
  );
}
