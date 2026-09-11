import { getGuestToken } from '@/server/auth/session';
import { pollRequest } from '@/server/services/live';

/**
 * The matching screen's poll.
 *
 * ---------------------------------------------------------------------------
 * WHY A ROUTE AND NOT A SERVER ACTION
 * ---------------------------------------------------------------------------
 * Server Actions are POSTs that participate in React's router cache and can
 * trigger a re-render of the tree that called them. This is a read, fired every
 * two seconds for a minute, whose result drives one small piece of local state
 * — using an Action for it would queue thirty router revalidations behind a
 * countdown.
 *
 * Actions are also serialised per client: React runs them one at a time. A poll
 * that overlaps a slow `cancel` would sit behind it in the queue, and the
 * countdown would stall at exactly the moment the shopper is deciding whether
 * to wait. A plain `fetch` has none of that coupling.
 *
 * ---------------------------------------------------------------------------
 * WHY THE READ ADVANCES THE STATE MACHINE
 * ---------------------------------------------------------------------------
 * `pollRequest` promotes queued sellers to ringing, times out the ones that did
 * not answer and expires the request when its window closes. There is no
 * scheduler in this application, and this is the read that makes one
 * unnecessary — see `services/live.ts`.
 *
 * That makes a GET that mutates, which is worth stating plainly rather than
 * hiding. It is safe in the ways that matter: the transition is a pure function
 * of the clock, so it is idempotent for any given instant and two concurrent
 * polls converge on the same result. What it is not is cacheable, hence the
 * `no-store` header — a cached poll would freeze the countdown.
 *
 * There is deliberately no `dynamic = 'force-dynamic'` here. Under Cache
 * Components a route is dynamic unless it opts INTO caching with `'use cache'`,
 * so the segment config is redundant — and the build rejects it outright rather
 * than ignoring it.
 */

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  /*
   * The guest token IS the authorisation.
   *
   * A request id is not a secret — it travels in a URL and lands in logs. The
   * token is what proves this browser opened the request, so a leaked id cannot
   * be used to watch a stranger being matched to shops near their home.
   */
  const guestKey = await getGuestToken();
  const view = guestKey ? await pollRequest(id, guestKey) : null;

  if (!view) {
    return Response.json({ ok: false, error: 'Not found' }, { status: 404 });
  }

  return Response.json(
    { ok: true, data: view },
    {
      headers: {
        // Belt and braces alongside `force-dynamic`: a proxy that cached this
        // would stop the countdown for everyone behind it.
        'cache-control': 'no-store, must-revalidate',
      },
    },
  );
}
