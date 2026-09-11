/**
 * Crossing into and out of the immersive route group.
 *
 * ===========================================================================
 * THE PROBLEM
 * ===========================================================================
 * `app/(storefront)` and `app/(immersive)` are sibling route groups under one
 * root layout. On a SOFT navigation between them, the App Router does not
 * unmount the layout it is leaving — it renders the new group's layout inside
 * the old one.
 *
 * Measured, not assumed. After a `<Link>` from `/categories` to `/reels`:
 *
 *     strip present      : true
 *     bottom navs in DOM : 2
 *     footers in DOM     : 1
 *
 * So a full-screen reel feed arrived with a site header above it, a footer
 * below it and two navigation bars stacked on each other. A hard reload of the
 * same URL renders correctly, which is what proves the server is right and the
 * client transition is the problem.
 *
 * It matters most in the other direction: a live video call inheriting the
 * storefront chrome puts a marquee of delivery promises over a conversation
 * with a shopkeeper.
 *
 * ===========================================================================
 * THE FIX
 * ===========================================================================
 * Cross the boundary with a DOCUMENT navigation rather than a client one, so
 * the whole tree is rebuilt from the root and exactly one layout is mounted.
 *
 * The cost is one page load at the boundary, and it is the cheapest possible
 * moment to pay it: entering the live experience is followed by a sixty-second
 * wait, and leaving it is the end of a call. Nobody is mid-task at either edge.
 *
 * ===========================================================================
 * USING IT
 * ===========================================================================
 * For a programmatic navigation, call `leaveGroup(href)` instead of
 * `router.push`. For a link, render a plain `<a href>` instead of `<Link>` —
 * an anchor already does a document navigation, which is the whole requirement.
 *
 * Navigations WITHIN a group stay soft: the matching screen moving to the live
 * room is immersive-to-immersive, and the seller console's live room is inside
 * the seller group. Those keep `router.push` and `<Link>`.
 */

/** URL prefixes served by `app/(immersive)`. */
export const IMMERSIVE_PREFIXES = ['/reels', '/live'] as const;

export function isImmersivePath(path: string): boolean {
  return IMMERSIVE_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`),
  );
}

/**
 * Navigate across the group boundary.
 *
 * A no-op on the server, so it is safe to call from a handler in a component
 * that also renders there.
 */
export function leaveGroup(href: string): void {
  if (typeof window === 'undefined') return;
  window.location.assign(href);
}
