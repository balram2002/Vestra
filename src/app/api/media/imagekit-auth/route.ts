import { imageKitReady } from '@/config/imagekit';
import { getSessionUser } from '@/server/auth/session';
import { uploadAuthParams } from '@/server/media/imagekit';

/**
 * A signed permit for one browser-direct upload.
 *
 * The upload UI needs real progress and a real time-remaining figure, which
 * means the browser has to be the thing sending the bytes — a Server Action
 * receives a finished multipart body and can report nothing about its journey.
 * So the browser uploads straight to ImageKit, and this route is what
 * authorises it to.
 *
 * That makes this an authorisation boundary, and it is treated as one:
 *
 *   - a signed-in user, always;
 *   - the folder comes from the SESSION, never from the request, so nobody can
 *     ask for a token that writes into another seller's folder;
 *   - the permit expires in ten minutes;
 *   - and nothing uploaded this way is trusted afterwards — whatever lands is
 *     re-read and checked by `verifyUploadedFile` before it is attached to
 *     anything.
 *
 * The private key never appears in the response. Only the HMAC does.
 */
export async function POST(request: Request) {
  if (!imageKitReady()) {
    return Response.json(
      { ok: false, error: 'Direct upload is not configured.' },
      { status: 503 },
    );
  }

  const user = await getSessionUser();
  if (!user) {
    return Response.json({ ok: false, error: 'Sign in to upload.' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { purpose?: unknown };
  const purpose = body.purpose === 'kyc' ? 'kyc' : 'listing';

  /*
   * The scope is derived, not accepted.
   *
   * A seller's uploads land under their own store id and a shopper's under
   * their user id, both taken from the session. Letting the client name the
   * folder would let one seller write into another's.
   */
  const owner = user.sellerId ?? user.id;
  const scope = `${purpose}-${owner}`;

  if (purpose === 'kyc' && !user.sellerId) {
    return Response.json(
      { ok: false, error: 'Start your application before uploading documents.' },
      { status: 403 },
    );
  }

  return Response.json(
    { ok: true, ...uploadAuthParams(scope) },
    // A permit is per-request and must never be reused from a cache.
    { headers: { 'cache-control': 'private, no-store' } },
  );
}
