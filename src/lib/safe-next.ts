/**
 * Where to send someone after they sign in, if the `next` they carried is safe.
 *
 * Only a path on this site. An open redirect is a phishing vector: a link to
 * our real sign-in page that lands on a look-alike afterwards is far more
 * convincing than a look-alike on its own.
 *
 * Starting with one slash is not enough. Browsers read `/\evil.com` as
 * `//evil.com`, and drop tabs and newlines, so `/\t/evil.com` becomes it too.
 * Resolving against a placeholder origin and checking the origin survived
 * catches those and whatever else the URL parser turns into a host.
 *
 * Never back to an auth page either: someone who has just signed in and is
 * sent to the sign-in page again would reasonably think it failed.
 */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//')) return null;
  if (next.includes('\\') || hasControlCharacter(next)) return null;

  const base = 'http://next.invalid';
  let url: URL;
  try {
    url = new URL(next, base);
  } catch {
    return null;
  }
  if (url.origin !== base) return null;
  if (/^\/(login|register)(\/|$)/.test(url.pathname)) return null;

  return `${url.pathname}${url.search}${url.hash}`;
}

function hasControlCharacter(value: string): boolean {
  for (let index = 0; index < value.length; index++) {
    const code = value.charCodeAt(index);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}
