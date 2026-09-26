import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { PageDesigner } from '@/components/console/design/page-designer';
import { PageHeader } from '@/components/console/page-header';
import { designFor, isPageDesignKey, PAGE_DESIGN_KEYS } from '@/domain/page-designs';
import { previewEntities } from '@/server/services/design-preview';
import { getDesignState } from '@/server/services/page-designs';

interface PageProps {
  params: Promise<{ page: string }>;
}

export function generateStaticParams() {
  return PAGE_DESIGN_KEYS.map((page) => ({ page }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { page } = await params;
  return { title: isPageDesignKey(page) ? designFor(page).title : 'Page design' };
}

/**
 * Marketing › page designs: one route for every designable storefront page.
 *
 * The page's definition supplies the title, the layouts and every setting; the
 * designer is the same screen for all of them. Permission is asserted inside
 * the suspended part, like every other admin screen.
 */
export default function AdminDesignPage({ params }: PageProps) {
  return (
    <Suspense fallback={<DesignerSkeleton />}>
      <Designer params={params} />
    </Suspense>
  );
}

async function Designer({ params }: PageProps) {
  const { page } = await params;
  if (!isPageDesignKey(page)) notFound();

  const definition = designFor(page);
  const [state, entities] = await Promise.all([
    getDesignState(page),
    previewEntities(definition.preview.entity),
  ]);

  return (
    <>
      <PageHeader
        title={definition.title}
        description={`${definition.description} Applies to ${definition.route}.`}
      />
      <PageDesigner page={page} initial={state} entities={entities.options} entityLabel={entities.label} />
    </>
  );
}

function DesignerSkeleton() {
  return (
    <div className="space-y-6" aria-hidden>
      <div className="skeleton h-9 w-56 rounded" />
      <div className="skeleton h-16 rounded-lg" />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_28rem]">
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-3">
            {[0, 1, 2].map((index) => (
              <div key={index} className="skeleton h-64 rounded-lg" />
            ))}
          </div>
          <div className="skeleton h-96 rounded-lg" />
        </div>
        <div className="skeleton h-[40rem] rounded-lg" />
      </div>
    </div>
  );
}
