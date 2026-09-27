import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

import { atLeastOne, PLACEHOLDER_SLUG } from '@/lib/static-params';
import { CmsPageView } from '@/components/cms/cms-page-view';
import { cmsMetadata } from '@/lib/seo/cms-metadata';
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

  return cmsMetadata(page, `/legal/${slug}`);
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
