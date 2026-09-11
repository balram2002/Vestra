'use client';

import { RotateCcw, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';

/**
 * An error inside a console page.
 *
 * Rendered INSIDE the console layout, so the rail, the breadcrumbs and the
 * user menu stay put and the operator can move to another page. A root-level
 * boundary would swap the whole console for a storefront error screen, which
 * reads as being logged out.
 */
export function ConsoleError({
  error,
  reset,
  homeHref,
}: {
  error: Error & { digest?: string };
  reset: () => void;
  homeHref: string;
}) {
  useEffect(() => {
    console.error('[vestrawab:console] page failed', error);
  }, [error]);

  return (
    <div className="border-line bg-raised mx-auto mt-8 max-w-lg rounded-2xl border p-8 text-center">
      <span className="bg-danger-50 text-danger-700 mx-auto grid size-12 place-items-center rounded-full">
        <TriangleAlert className="size-6" aria-hidden />
      </span>
      <h1 className="text-ink mt-4 text-lg font-semibold">This page could not load</h1>
      <p className="text-muted mt-1.5 text-sm">
        The rest of the console still works. Try again, or quote the reference below if it keeps
        happening.
      </p>
      {error.digest ? (
        <p className="text-faint mt-3 font-mono text-xs">Reference {error.digest}</p>
      ) : null}
      <div className="mt-6 flex flex-wrap justify-center gap-2">
        <Button size="sm" onClick={reset}>
          <RotateCcw className="size-3.5" aria-hidden />
          Try again
        </Button>
        <Button asChild size="sm" variant="secondary">
          <Link href={homeHref}>Back to the dashboard</Link>
        </Button>
      </div>
    </div>
  );
}