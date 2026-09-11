'use client';

import { RotateCcw, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useEffect } from 'react';

import { StatusPage } from '@/components/layout/status-page';
import { Button } from '@/components/ui/button';

/**
 * Root error boundary.
 *
 * Shows the DIGEST rather than the message: the message can carry internal
 * detail, while the digest is a safe identifier a support agent can use to find
 * the exact server-side trace. It is set in the mono face for the same reason
 * an AWB is — someone is going to read it down a phone line.
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
    console.error('[vestrawab] unhandled error', error);
  }, [error]);

  return (
    <StatusPage
      icon={TriangleAlert}
      tone="danger"
      title="Something went wrong at our end"
      body="This is not your fault. Try again — if it keeps happening, quote the reference below to support and they can find exactly what failed."
      code={error.digest}
      actions={
        <>
          <Button onClick={reset}>
            <RotateCcw className="size-4" />
            Try again
          </Button>
          <Button asChild variant="secondary">
            <Link href="/">Go to the home page</Link>
          </Button>
        </>
      }
    />
  );
}
