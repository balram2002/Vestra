'use client';

import { ConsoleError } from '@/components/console/console-error';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return <ConsoleError error={error} reset={reset} homeHref="/seller" />;
}