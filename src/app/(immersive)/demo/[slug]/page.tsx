import type { Metadata } from 'next';
import { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { absoluteUrl } from '@/config/site';
import { DemoView } from '@/components/live/demo-view';
import type { DemoPageSettings, DemoPageVariant } from '@/domain/page-designs/demo';
import { getLiveDesign } from '@/server/services/page-designs';
import { getProductDemo } from '@/server/services/product-demo';

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
  const [demo, design] = await Promise.all([readDemo(props), getLiveDesign('demo')]);
  if (!demo) notFound();
  // Which layout, and which of its parts, is decided under Admin › Page designs › Product demo.
  return (
    <DemoView
      demo={demo}
      variant={design.variant as DemoPageVariant}
      settings={design.settings[design.variant] as DemoPageSettings}
    />
  );
}
