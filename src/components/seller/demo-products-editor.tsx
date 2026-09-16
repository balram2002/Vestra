'use client';

import { useState, useTransition } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import type { Media } from '@/domain/types';
import { Button } from '@/components/ui/button';
import { saveDemoProducts } from '@/server/actions/demo-products';

export function DemoProductsEditor({ productId, slug, media, products }: { productId: string; slug: string; media: Media[]; products: Array<{ id: string; title: string }> }) {
  const videos = media.filter((item) => item.kind === 'VIDEO');
  if (!videos.length) return null;
  return <section className="bg-raised border-line rounded-2xl border p-5"><h2 className="font-display text-lg font-semibold">Shop this demo</h2><p className="text-muted mt-2 text-sm">This product appears automatically. Tag the other pieces shown in each video so shoppers can buy the complete look.</p><div className="mt-4 space-y-4">{videos.map((clip, index) => <ClipProducts key={clip.id} productId={productId} slug={slug} clip={clip} index={index} products={products} />)}</div></section>;
}

function ClipProducts({ productId, slug, clip, index, products }: { productId: string; slug: string; clip: Media; index: number; products: Array<{ id: string; title: string }> }) {
  const [ids, setIds] = useState(clip.featuredProductIds ?? []);
  const [query, setQuery] = useState('');
  const [pending, start] = useTransition();
  return <details className="border-line rounded-xl border p-3"><summary className="cursor-pointer text-sm font-medium">Video {index + 1} · {ids.length} additional products</summary><Link href={`/demo/${slug}?clip=${encodeURIComponent(clip.id)}`} className="text-accent-ink mt-2 inline-flex min-h-11 items-center text-sm underline">Open shareable demo</Link><input aria-label={`Find products for video ${index + 1}`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Find a product…" className="border-line bg-canvas mb-2 h-11 w-full rounded-lg border px-3 text-sm" /><div className="max-h-56 overflow-y-auto">{products.filter((product) => product.title.toLowerCase().includes(query.toLowerCase())).map((product) => <label key={product.id} className="flex min-h-11 items-start gap-2 py-2 text-xs"><input type="checkbox" className="mt-0.5" checked={ids.includes(product.id)} disabled={!ids.includes(product.id) && ids.length >= 11} onChange={(event) => setIds(event.target.checked ? [...ids, product.id] : ids.filter((id) => id !== product.id))} /><span>{product.title}</span></label>)}</div><Button className="mt-3" size="sm" disabled={pending} onClick={() => start(async () => { const result = await saveDemoProducts({ productId, mediaId: clip.id, featuredProductIds: ids }); if (result.ok) toast.success('Featured products saved'); else toast.error(result.error); })}>{pending ? 'Saving…' : 'Save featured products'}</Button></details>;
}
