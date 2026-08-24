'use client';

import { RotateCcw } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';

import { Button } from '@/components/ui/button';

/**
 * Root error boundary.
 *
 * Shows the digest rather than the message: the message can carry internal
 * detail, while the digest is a safe identifier a support agent can use to find
 * the exact server-side trace.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // In production this is where the error goes to the monitoring pipeline.
    console.error('[vestra] unhandled error', error);
  }, [error]);

  return (
    <div className="gutter shell-max flex min-h-[60dvh] flex-col items-center justify-center py-16 text-center">
      <h1 className="font-display text-ink text-2xl">Something went wrong at our end</h1>
      <p className="text-muted mt-2 max-w-md text-sm">
        This is not your fault. Try again — if it keeps happening, quote the reference below to
        support and they can find exactly what failed.
      </p>

      {error.digest ? (
        <p className="text-faint mt-3 font-mono text-xs">Reference {error.digest}</p>
      ) : null}

      <div className="mt-7 flex flex-wrap justify-center gap-2">
        <Button onClick={reset}>
          <RotateCcw className="size-4" />
          Try again
        </Button>
        <Button asChild variant="secondary">
          <Link href="/">Go to the home page</Link>
        </Button>
      </div>
    </div>
  );
}
