import Link from 'next/link';

import { Button } from '@/components/ui/button';

/**
 * 404.
 *
 * Offers a route onward rather than a dead end — most 404s here are a stale
 * link to a product that was archived, so the useful next step is a department,
 * not an apology.
 */
export default function NotFound() {
  return (
    <div className="gutter shell-max flex min-h-[60dvh] flex-col items-center justify-center py-16 text-center">
      <p className="text-faint font-display text-5xl">404</p>
      <h1 className="font-display text-ink mt-3 text-2xl">We could not find that page</h1>
      <p className="text-muted mt-2 max-w-md text-sm">
        The link may be out of date, or the product may have been archived by its seller.
      </p>

      <div className="mt-7 flex flex-wrap justify-center gap-2">
        <Button asChild>
          <Link href="/">Go to the home page</Link>
        </Button>
        <Button asChild variant="secondary">
          <Link href="/search">Search the catalogue</Link>
        </Button>
      </div>
    </div>
  );
}
