import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { SellerLiveRoom } from '@/components/live/seller-live-room';
import { requireSeller } from '@/server/auth/session';
import { getSession } from '@/server/services/live';

/**
 * The shop's live room.
 *
 * Reads the session record directly rather than going through the buyer action,
 * because this side needs the one field that action deliberately strips:
 * `hostUrl`. That is a host credential — whoever holds it can host the call,
 * mute the shopkeeper and admit strangers into their shop — so it is only ever
 * assembled here, behind a seller session, for the seller who owns it.
 *
 * `noindex`, and the ownership check is not a formality: a session id in a URL
 * must not hand a host link to a different shop.
 */

export const metadata: Metadata = {
  title: 'Live call',
  robots: { index: false, follow: false },
};

/*
 * Not async, and `params` crosses the boundary unawaited — under Cache
 * Components a runtime read outside a Suspense boundary fails the build.
 */
export default function SellerLivePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<RoomSkeleton />}>
      <SellerRoomContents params={params} />
    </Suspense>
  );
}

async function SellerRoomContents({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  const seller = await requireSeller();
  const session = await getSession(id);

  if (!session || session.sellerId !== seller.sellerId) notFound();

  /*
   * An ended call is a 404 rather than a dead room with a live offer field.
   *
   * A shopkeeper who reopens an old link must not be able to send a price to a
   * shopper who left twenty minutes ago — the offer would sit on the session
   * and be honoured by a Buy button nobody is looking at.
   */
  if (session.status === 'ENDED' || session.status === 'FAILED') notFound();

  return (
    <SellerLiveRoom
      sessionId={session.id}
      hostUrl={session.meeting?.hostUrl ?? null}
      embeddable={session.meeting?.embeddable ?? false}
      productTitle={session.productTitle}
      productImage={session.productImage}
      sellingPrice={session.sellingPrice}
      initial={{
        id: session.id,
        status: session.status,
        outcome: session.outcome,
        offeredPrice: session.offeredPrice,
        offerExpiresAt: session.offerExpiresAt,
        startedAt: session.startedAt,
        messages: session.messages ?? [],
        speakRequestedAt: session.speakRequestedAt ?? null,
      }}
    />
  );
}

function RoomSkeleton() {
  return (
    <div className="grid h-[70dvh] place-items-center rounded-2xl bg-slate-950" aria-hidden>
      <span className="size-8 animate-spin rounded-full border-2 border-white/30 border-t-transparent" />
    </div>
  );
}
