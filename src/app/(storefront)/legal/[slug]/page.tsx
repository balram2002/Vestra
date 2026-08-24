import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { CmsPageView } from '@/components/cms/cms-page-view';
import { absoluteUrl } from '@/config/site';
import { getCmsPage, listCmsPages } from '@/server/services/content';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  const pages = await listCmsPages('legal');
  return pages.map((page) => ({ slug: page.slug.replace('legal/', '') }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = await getCmsPage(`legal/${slug}`);
  if (!page) return {};

  return {
    title: page.title,
    description: page.metaDescription ?? undefined,
    alternates: { canonical: absoluteUrl(`/legal/${slug}`) },
  };
}

export default async function LegalPage({ params }: PageProps) {
  const { slug } = await params;
  const page = await getCmsPage(`legal/${slug}`);
  if (!page) notFound();

  return (
    <CmsPageView
      page={page}
      breadcrumbs={[
        { href: '/', label: 'Home' },
        { href: `/legal/${slug}`, label: page.title },
      ]}
    />
  );
}
