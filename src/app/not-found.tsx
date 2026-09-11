import { Compass } from 'lucide-react';
import Link from 'next/link';

import { StatusPage } from '@/components/layout/status-page';
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
    <StatusPage
      icon={Compass}
      code="404"
      title="We could not find that page"
      body="The link may be out of date, or the product may have been archived by its seller."
      actions={
        <>
          <Button asChild>
            <Link href="/">Go to the home page</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link href="/search">Search the catalogue</Link>
          </Button>
        </>
      }
    />
  );
}
