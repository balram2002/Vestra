import { Suspense } from 'react';

import { SiteFooter } from '@/components/layout/site-footer';
import { SiteHeader } from '@/components/layout/site-header';
import { RouteProgress } from '@/components/layout/route-progress';

/**
 * Storefront shell.
 *
 * Header and footer live here rather than in the root layout because the seller
 * and admin consoles are a different shell entirely and would have to undo this
 * one.
 *
 * The skip link is the first focusable element on every storefront page: with a
 * mega menu this size, a keyboard user would otherwise tab through eighty
 * category links before reaching the product they came for.
 */
export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <RouteProgress />

      <a
        href="#main"
        className="bg-accent text-on-inverse sr-only z-[70] rounded-md px-4 py-2 text-sm font-medium focus:not-sr-only focus:absolute focus:left-4 focus:top-4"
      >
        Skip to content
      </a>

      {/* The header reads the taxonomy, so it streams rather than blocking the page. */}
      <Suspense fallback={<div className="bg-raised border-line h-[6.25rem] border-b" />}>
        <SiteHeader />
      </Suspense>

      <main id="main" className="flex-1">
        {children}
      </main>

      <Suspense fallback={null}>
        <SiteFooter />
      </Suspense>
    </div>
  );
}
