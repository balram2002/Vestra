import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { LiveRoom } from '@/components/live/live-room';
import { getLiveSession } from '@/server/actions/live';
import { getProductById } from '@/server/services/catalog';

/**
 * The live room's page.
 *
 * Thin on purpose: it authorises, then hands the session to a client component.
 * Everything on this screen changes while it is open — the price the shop
 * quotes, whether the call is still running — so there is nothing worth
 * prerendering beyond the first frame.
 *
 * `getLiveSession` is the same action the room polls with, and it is what
 * enforces ownership: the buyer's guest token must match the one the request
 * was created with, so a session id in a shared URL cannot put a stranger into
 * somebody's call. It also strips `hostUrl`, which is a host credential.
 *
 * The read sits behind `<Suspense>` because it reads the guest cookie, and
 * under Cache Components an uncached read outside a boundary fails the build.
 *
 * `noindex` for the obvious reason — a call between two people is not a page.
 */

export const metadata: Metadata = {
  title: 'Live',
  robots: { index: false, follow: false },
};

/*
 * Not async, and `params` is passed down unawaited — awaiting it here would be
 * a runtime read outside the Suspense boundary, which Cache Components rejects.
 */
export default function LiveSessionPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<RoomSkeleton />}>
      <RoomContents params={params} />
    </Suspense>
  );
}

async function RoomContents({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const result = await getLiveSession(id);
  if (!result.ok || !result.data) notFound();

  /*
   * An ended call is a 404, not an empty room.
   *
   * A shopper who reopens an old link should be told the call is over rather
   * than dropped into a dead video surface with a Buy button on it — which
   * would be quoting a price nobody is standing behind any more.
   */
  if (result.data.status === 'ENDED' || result.data.status === 'FAILED') notFound();

  const session = result.data;

  /*
   * The sizes the room can sell, read once here rather than on every poll.
   * Narrowed to the colour the shopper was looking at, when they had one,
   * because a size sheet that mixes colours makes them choose twice.
   */
  const product = await getProductById(session.productId);
  const chosen = product?.variants.find((variant) => variant.id === session.variantId);
  const sizes = (product?.variants ?? [])
    .filter((variant) => variant.isActive && (!chosen || variant.color === chosen.color))
    .map((variant) => ({
      variantId: variant.id,
      size: variant.size,
      colorLabel: variant.colorLabel,
      available: variant.inventory.available,
      sellingPrice: variant.sellingPrice,
    }));

  return (
    <LiveRoom
      session={session}
      sizes={sizes}
      productHref={product ? `/product/${product.slug}` : '/'}
    />
  );
}

/**
 * A dark shell, not a grey one.
 *
 * The room is a near-black full-bleed surface, so a pale skeleton would flash
 * white before the video arrives — on a phone, at whatever brightness the
 * shopper happens to be at. Matching the room's own ground makes the transition
 * invisible.
 */
function RoomSkeleton() {
  return (
    <div className="grid min-h-dvh place-items-center bg-slate-950" aria-hidden>
      <span className="size-8 animate-spin rounded-full border-2 border-white/30 border-t-transparent" />
    </div>
  );
}
