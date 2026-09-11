import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { FindingStore } from '@/components/live/finding-store';
import { getGuestToken } from '@/server/auth/session';
import { getProductById } from '@/server/services/catalog';
import { describeRequest, pollRequest } from '@/server/services/live';

/**
 * The matching screen.
 *
 * The shell renders immediately and the request streams in behind `<Suspense>`
 * — reading the guest cookie is what makes this dynamic, and under Cache
 * Components an uncached read outside a boundary fails the build rather than
 * silently opting the route out of prerendering.
 *
 * The first poll is server-rendered rather than left to the client. That
 * matters more here than usual: the shopper has just pressed a button and is
 * arriving on a screen whose entire job is to look busy, so a frame of empty
 * skeleton before the first candidate appears reads as the request having
 * failed before it started.
 *
 * `noindex` because a request id is per-shopper and lives for sixty seconds.
 * There is nothing here for a crawler, and a stale one in an index would 404.
 */

export const metadata: Metadata = {
  title: 'Finding a store',
  robots: { index: false, follow: false },
};

/*
 * The page itself is NOT async, and `params` is passed down unawaited.
 *
 * Awaiting it here would be a runtime read outside the boundary, which under
 * Cache Components fails the build — the same reason the session read is inside
 * `FindingContents` rather than above it. The Promise crosses the boundary and
 * is resolved on the other side.
 */
export default function FindingPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<FindingSkeleton />}>
      <FindingContents params={params} />
    </Suspense>
  );
}

async function FindingContents({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  /*
   * The same guest token that owns the request — READ, never created.
   *
   * A request id travels in a URL and lands in logs; the token is what proves
   * this browser opened it. Without the check, a shared link would show a
   * stranger which shops near somebody's home are being called.
   *
   * `ensureGuestToken` would be the wrong call here and it was the first
   * version of this line: it WRITES a cookie, and a Server Component render
   * cannot set cookies — Next throws, and the page renders its error boundary
   * rather than the countdown. A browser with no token cannot own a request
   * anyway, so there is nothing to create.
   */
  const guestKey = await getGuestToken();
  if (!guestKey) notFound();

  /*
   * Two reads, and they are not the same read.
   *
   * `pollRequest` returns the narrow polling view — the four fields that change
   * during a match — and advances the state machine as a side effect.
   * `describeRequest` returns the static product fields the screen needs once:
   * a title, a photograph and the way back.
   *
   * Keeping them apart is what stops the poll payload carrying an unchanging
   * product title thirty times over a minute.
   */
  const [view, description] = await Promise.all([
    pollRequest(id, guestKey),
    describeRequest(id, guestKey),
  ]);

  if (!view || !description) notFound();

  const product = await getProductById(description.productId);

  return (
    <FindingStore
      requestId={id}
      initial={view}
      productTitle={description.productTitle}
      productImage={description.productImage}
      // Falls back to the catalogue rather than 404ing the way out: a shopper
      // must always be able to leave this screen.
      productHref={product ? `/product/${product.slug}` : '/'}
    />
  );
}

/**
 * The shell, at the real geometry.
 *
 * The countdown ring and three candidate rows, sized exactly as the live ones,
 * so nothing moves when the request lands. A skeleton that guesses its own
 * height is a layout shift with extra steps — and on this screen the shift
 * would land under the shopper's thumb.
 */
function FindingSkeleton() {
  return (
    <div className="gutter shell-narrow flex min-h-dvh flex-col py-6" aria-hidden>
      <div className="skeleton h-7 w-3/4 rounded-md" />
      <div className="skeleton mt-2 h-4 w-1/2 rounded" />

      <div className="my-8 flex justify-center">
        <div className="skeleton size-28 rounded-full" />
      </div>

      <div className="space-y-2">
        {[0, 1, 2].map((row) => (
          <div key={row} className="border-line flex items-center gap-3 rounded-xl border p-3">
            <div className="skeleton size-11 shrink-0 rounded-lg" />
            <div className="flex-1 space-y-1.5">
              <div className="skeleton h-3.5 w-2/5 rounded" />
              <div className="skeleton h-2.5 w-1/3 rounded" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
