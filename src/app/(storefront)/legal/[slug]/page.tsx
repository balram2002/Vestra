import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { atLeastOne, PLACEHOLDER_SLUG } from '@/lib/static-params';
import { CmsPageView } from '@/components/cms/cms-page-view';
import { absoluteUrl } from '@/config/site';
import { getCmsPage, listCmsPages } from '@/server/services/content';

interface PageProps {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return atLeastOne(
    async () => (await listCmsPages('legal')).map((page) => ({ slug: page.slug.replace('legal/', '') })),
    { slug: PLACEHOLDER_SLUG },
  );
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
      contact={slug === 'grievance' ? 'grievance' : undefined}
      breadcrumbs={[
        { href: '/', label: 'Home' },
        { href: `/legal/${slug}`, label: page.title },
      ]}
    />
  );
}
