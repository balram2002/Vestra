import { NextResponse, type NextRequest } from 'next/server';

import { VISITOR_COOKIE } from '@/domain/experiments';
import { SESSION_COOKIE, SESSION_HINT_COOKIE, verifySession } from '@/server/auth/jwt';
import { consoleForPath, isSellerRole, isStaffRole } from '@/server/auth/rbac';

/**
 * Network-boundary routing rules.
 *
 * Replaces the old `middleware.ts` convention, which Next 16 deprecates.
 *
 * What belongs here is only what must happen BEFORE a route renders:
 * redirecting an anonymous visitor away from a console, and keeping staff and
 * sellers out of each other's applications. Everything finer-grained -- which
 * orders a seller may read, which buttons an ops user gets -- is enforced in
 * the data layer via `requirePermission`, because this file is optimised for
 * edge execution and deliberately cannot reach the database.
 *
 * Treat this as a courtesy redirect, not a security boundary. It stops a
 * shopper landing on a broken admin screen; it is NOT what stops them reading
 * admin data. That is `server/auth/session.ts`.
 */

/**
 * A/B tests need a stable, anonymous visitor id. It is given on the first
 * designable page a visitor opens, and written into THIS request as well as
 * the response, so the very first render already knows the visitor's arm --
 * otherwise first visits would all land in the control and skew every test.
 *
 * Only the response that sets it is marked private. Every later request
 * carries the cookie and sets nothing, so pages cache as before.
 */
function withVisitor(request: NextRequest): NextResponse {
  if (request.cookies.has(VISITOR_COOKIE)) return NextResponse.next();
  const id = crypto.randomUUID();
  request.cookies.set(VISITOR_COOKIE, id);
  const response = NextResponse.next({ request: { headers: request.headers } });
  response.cookies.set(VISITOR_COOKIE, id, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 180,
  });
  response.headers.set('Cache-Control', 'private, no-store');
  return response;
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const area = consoleForPath(pathname);

  if (area === 'public') return withVisitor(request);

  const claims = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);

  // Not signed in: send to login and remember where they were headed so the
  // sign-in action can return them there instead of dumping them on the home page.
  if (!claims) {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', `${pathname}${search}`);
    if (request.cookies.has(SESSION_COOKIE) || request.cookies.has(SESSION_HINT_COOKIE)) login.searchParams.set('session', 'expired');
    return NextResponse.redirect(login);
  }

  if (area === 'admin' && !claims.roles.some(isStaffRole)) {
    return NextResponse.redirect(new URL('/', request.url));
  }

  if (area === 'seller') {
    const isSeller = claims.roles.some(isSellerRole);
    // Staff need to be able to open a seller's console for support work.
    const isStaff = claims.roles.some(isStaffRole);
    if (!isSeller && !isStaff) {
      return NextResponse.redirect(new URL('/', request.url));
    }
  }

  // Consoles must never be cached by a shared cache: they are per-user by
  // definition and a stale hit would show one seller another's numbers.
  const response = NextResponse.next();
  if (area !== 'account') {
    response.headers.set('Cache-Control', 'private, no-store');
  }
  return response;
}

export const config = {
  /**
   * Only the protected surfaces. Everything else -- the storefront, static
   * assets, image optimisation, the media route -- skips this entirely, which
   * keeps the catalogue fully cacheable at the CDN.
   */
  matcher: [
    /*
     * The designable storefront pages, for the A/B visitor id only (see
     * `withVisitor`). Nothing else on the storefront runs this file.
     */
    '/product/:path*',
    '/store/:path*',
    '/stores',
    '/category/:path*',
    '/brand/:path*',
    '/search',
    '/demo/:path*',
    '/admin/:path*',
    '/seller/:path*',
    '/account/:path*',
    /*
     * `/orders` and `/checkout` are deliberately NOT here.
     *
     * Guests buy. A blanket redirect to login on either would make guest
     * checkout impossible, so both enforce access at the page instead: the
     * order list calls `requireUser`, and an individual order resolves through
     * `getOrderForViewer`, which scopes a signed-in shopper by their id and a
     * guest by the cookie their browser was given when they placed it.
     */
  ],
};
