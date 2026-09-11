import { RouteProgress } from '@/components/layout/route-progress';

/**
 * The immersive shell.
 *
 * Full-viewport surfaces that must NOT inherit the storefront's chrome: the
 * reel feed, the matching screen, and the live room itself.
 *
 * ---------------------------------------------------------------------------
 * WHY THESE CANNOT LIVE IN THE STOREFRONT GROUP
 * ---------------------------------------------------------------------------
 * They were there first, and it was wrong in two ways that only showed up when
 * the pages were actually driven in a browser.
 *
 * The obvious one: a video call rendered under an announcement strip, a mega
 * menu and a footer. The room is a `min-h-dvh` black surface designed to be the
 * whole screen, and the storefront put a marquee of delivery promises above it.
 *
 * The subtle one: the reel feed is an `h-dvh` scroll-snap container, and inside
 * a layout that is itself taller than the viewport, the PAGE scrolls instead of
 * the feed. Swiping did nothing — the snap container never received the
 * gesture. A full-height scroller only works when it owns the viewport.
 *
 * A nested layout can only ADD to its parent, never remove, so escaping the
 * header meant escaping the group.
 *
 * ---------------------------------------------------------------------------
 * WHAT IS KEPT
 * ---------------------------------------------------------------------------
 * Only the navigation progress bar, because a slow route transition still needs
 * to say something on a black screen.
 *
 * The bottom bar is deliberately NOT here: the reel feed wants it (it is a
 * browse surface, and the mockup shows it), while the live room and the
 * matching screen must not have it — a call with a "Bag" tab under it invites
 * exactly the tap that ends the call. So `/reels` mounts the bar itself.
 */
export default function ImmersiveLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <RouteProgress />
      {children}
    </>
  );
}
