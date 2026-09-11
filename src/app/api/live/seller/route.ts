import { getSessionUser } from '@/server/auth/session';
import { expireStale, pendingForSeller } from '@/server/services/live';

/**
 * The shop's poll for incoming calls.
 *
 * A route rather than a Server Action for the same reasons as the buyer's poll:
 * it is a read on a short interval whose result drives local state, and an
 * Action would queue router revalidations behind it and serialise it against
 * every other Action the console fires.
 *
 * ---------------------------------------------------------------------------
 * WHY HOUSEKEEPING RUNS HERE
 * ---------------------------------------------------------------------------
 * `expireStale` closes requests whose window has passed with nobody watching,
 * and ends sessions that overran because a tab was left open. It needs to run
 * regularly, and this is the only endpoint in the application guaranteed to be
 * called regularly while the feature is in use — a live shop polls it every few
 * seconds, and if no shop is live there is nothing to clean up.
 *
 * The alternative is a cron this application does not have, for a job that is
 * two indexed updates. Attaching it to the seller poll means the cleanup runs
 * exactly when the system is busy and stops entirely when it is idle, which is
 * the correct shape for this work.
 *
 * ---------------------------------------------------------------------------
 * WHY NOT `requireSeller`
 * ---------------------------------------------------------------------------
 * That helper redirects or throws a `forbidden()` on failure, which is right for
 * a page and wrong for a polled endpoint: a console left open past its session
 * expiry would fire a redirect every few seconds into a `fetch` that cannot
 * follow it. This returns 401 and lets the client stop polling and say so.
 *
 * No `dynamic` segment config, for the same reason as the buyer's poll: under
 * Cache Components a route is dynamic unless it opts into caching, and
 * declaring it fails the build.
 */

export async function GET() {
  const user = await getSessionUser();

  if (!user?.sellerId) {
    return Response.json({ ok: false, error: 'Not signed in' }, { status: 401 });
  }

  await expireStale();
  const requests = await pendingForSeller(user.sellerId);

  return Response.json(
    {
      ok: true,
      data: requests.map((request) => ({
        id: request.id,
        productTitle: request.productTitle,
        productImage: request.productImage,
        sellingPrice: request.sellingPrice,
        /*
         * The shop is told what it is being asked for and how far away the
         * shopper is — but never who they are. A shopkeeper deciding whether to
         * pick up needs the product and the distance; a name and a location
         * before any contact is made is surveillance, and it is not needed to
         * answer a call.
         */
        pincode: request.pincode,
        hasExactItem:
          request.candidates.find((c) => c.sellerId === user.sellerId)?.hasExactItem ?? false,
        distanceKm:
          request.candidates.find((c) => c.sellerId === user.sellerId)?.distanceKm ?? 0,
        /** Seconds left to answer, so the card can show its own countdown. */
        secondsRemaining: Math.max(
          0,
          Math.ceil((Date.parse(request.expiresAt) - Date.now()) / 1000),
        ),
      })),
    },
    { headers: { 'cache-control': 'no-store, must-revalidate' } },
  );
}
