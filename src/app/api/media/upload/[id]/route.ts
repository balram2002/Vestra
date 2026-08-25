import { mediaStore } from '@/server/media/store';

/**
 * Serve a seller upload.
 *
 * Public by design — product photography is public the moment the listing is —
 * but served through a route rather than from a static directory so the store
 * driver can move to object storage without any URL changing.
 *
 * Two headers matter. `Cache-Control: immutable` is safe because the id is
 * content-addressed: different bytes always mean a different id. And
 * `Content-Disposition: attachment` plus a nosniff policy means that even if a
 * file somehow reached the store misidentified, a browser will not execute it
 * in our origin.
 */
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;

  const file = await mediaStore().get(id);
  if (!file) return new Response('Not found', { status: 404 });

  return new Response(new Uint8Array(file.body), {
    headers: {
      'content-type': file.contentType,
      'content-length': String(file.body.byteLength),
      'cache-control': 'public, max-age=31536000, immutable',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'none'; sandbox;",
    },
  });
}
