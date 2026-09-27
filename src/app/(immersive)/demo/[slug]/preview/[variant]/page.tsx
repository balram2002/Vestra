import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { DemoView } from '@/components/live/demo-view';
import { DEMO_PAGE_VARIANTS, type DemoPageSettings, type DemoPageVariant } from '@/domain/page-designs/demo';
import { getPreviewDesign } from '@/server/services/page-designs';
import { getProductDemo } from '@/server/services/product-demo';

export const metadata: Metadata = {
  title: 'Demo preview',
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ slug: string; variant: string }> };

/**
 * One product's demo in one layout, with the DRAFT settings -- what the
 * Product demo designer frames. Staff only: `getPreviewDesign` asserts it.
 * Full screen like the real page, so no preview bar is laid over the video;
 * the designer around the frame says what is being previewed.
 */
export default function DemoPreviewPage({ params }: Props) {
  return (
    <Suspense
      fallback={
        <main className="grid h-dvh place-items-center bg-black text-white">
          <p role="status">Loading your demo…</p>
        </main>
      }
    >
      <Preview params={params} />
    </Suspense>
  );
}

async function Preview({ params }: Props) {
  const [{ slug, variant: raw }, design] = await Promise.all([params, getPreviewDesign('demo')]);
  if (!DEMO_PAGE_VARIANTS.includes(raw as DemoPageVariant)) notFound();
  const demo = await getProductDemo(slug);
  if (!demo) notFound();
  const variant = raw as DemoPageVariant;
  return <DemoView demo={demo} variant={variant} settings={design.settings[variant] as DemoPageSettings} />;
}
