import type { Metadata } from 'next';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { absoluteUrl } from '@/config/site';
import { DemoView } from '@/components/live/demo-view';
import type { DemoPageSettings, DemoPageVariant } from '@/domain/page-designs/demo';
import { getLiveDesign } from '@/server/services/page-designs';
import { getProductDemo } from '@/server/services/product-demo';
import { getRunningExperiment } from '@/server/services/experiments';
import { ExperimentArm } from '@/components/experiments/experiment-arm';

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<{ clip?: string | string[] }> };

async function readDemo({ params, searchParams }: Props) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  return getProductDemo(slug, Array.isArray(query.clip) ? query.clip[0] : query.clip);
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const demo = await readDemo(props);
  if (!demo) return { title: 'Demo unavailable', robots: { index: false } };
  return { title: `${demo.title} · Watch & shop`, description: demo.caption,
    alternates: { canonical: absoluteUrl(demo.path) },
    openGraph: { title: demo.title, description: `Watch it at ${demo.seller.name}. Shop the products in this demo.`, url: absoluteUrl(demo.path), type: 'website', images: demo.posterUrl ? [{ url: absoluteUrl(demo.posterUrl), alt: demo.title }] : [] },
    twitter: { card: 'summary_large_image', title: demo.title, images: demo.posterUrl ? [absoluteUrl(demo.posterUrl)] : [] } };
}

export default function DemoPage(props: Props) {
  return <Suspense fallback={<main className="grid h-dvh place-items-center bg-black text-white"><p role="status">Loading your demo…</p></main>}><DemoContent {...props} /></Suspense>;
}

async function DemoContent(props: Props) {
  const [demo, design, experiment] = await Promise.all([readDemo(props), getLiveDesign('demo'), getRunningExperiment('demo')]);
  if (!demo) notFound();
  // Which layout, and which of its parts, is decided under Admin › Page designs › Product demo.
  const view = (layout: string) => (
    <DemoView demo={demo} variant={layout as DemoPageVariant} settings={design.settings[layout] as DemoPageSettings} />
  );
  // Already inside this page's Suspense: under an A/B test the layout is chosen per visitor.
  return experiment ? <ExperimentArm experiment={experiment}>{view}</ExperimentArm> : view(design.variant);
}
