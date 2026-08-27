import { getSessionUser } from '@/server/auth/session';
import { mediaStore } from '@/server/media/store';

/**
 * Upload one file through this app.
 *
 * The fallback path, used when ImageKit is not configured. It exists so the
 * upload UI has one behaviour rather than two: the browser still sends the
 * bytes with `XMLHttpRequest`, so progress and time-remaining are just as real
 * here as they are on the direct path — the bytes simply land on our disk
 * instead of ImageKit's.
 *
 * A route rather than a Server Action for exactly that reason. A Server Action
 * receives a finished multipart body; there is no way to report on a journey
 * that is already over.
 *
 * One file per request, so a failure is attributable to a file and a retry
 * re-sends only what failed.
 */
export async function POST(request: Request) {
  const user = await getSessionUser();
  if (!user) {
    return Response.json({ ok: false, error: 'Sign in to upload.' }, { status: 401 });
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return Response.json({ ok: false, error: 'That upload was malformed.' }, { status: 400 });
  }

  const file = form.get('file');
  if (!(file instanceof File)) {
    return Response.json({ ok: false, error: 'Choose a file to upload.' }, { status: 400 });
  }

  const purpose = form.get('purpose') === 'kyc' ? 'kyc' : 'listing';

  if (purpose === 'kyc' && !user.sellerId) {
    return Response.json(
      { ok: false, error: 'Start your application before uploading documents.' },
      { status: 403 },
    );
  }

  /*
   * The scope is derived from the session, never from the request — the same
   * rule the direct-upload permit follows, for the same reason.
   */
  const scope = `${purpose}-${user.sellerId ?? user.id}`;

  // The store checks the BYTES; nothing here trusts the declared type.
  const stored = await mediaStore().put(file, { scope });
  if (!stored.ok) {
    return Response.json({ ok: false, error: stored.error }, { status: 400 });
  }

  return Response.json(
    { ok: true, media: stored.media },
    { headers: { 'cache-control': 'private, no-store' } },
  );
}
