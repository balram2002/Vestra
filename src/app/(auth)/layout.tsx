import Link from 'next/link';

import { BrandLockup, BrandMark } from '@/components/layout/wordmark';
import { siteConfig } from '@/config/site';
import { getSiteContent } from '@/server/services/site-content';

/**
 * Auth shell.
 *
 * Its own route group, so sign-in does not inherit the storefront's mega menu
 * and footer. Someone on this page has one job; a full navigation is an
 * invitation to abandon it.
 *
 * A SPLIT LAYOUT above `lg`, and a single column below it. The left panel is
 * not decoration: signing in is the moment someone decides whether to trust
 * this page with a password, and a bare form on a white field looks equally
 * like a real login and a phishing page. The mark, the name of the company
 * behind it, and the three promises the shop makes everywhere else are what
 * make it recognisably the same product they were just browsing.
 *
 * Below `lg` the panel is dropped entirely rather than stacked above the form.
 * On a phone the keyboard takes half the screen, and anything above the fields
 * pushes them under it.
 */
export default async function AuthLayout({ children }: { children: React.ReactNode }) {
  /*
   * The promises come from the same place the homepage and the strip read.
   *
   * They were three strings in this file, which is how a shop ends up
   * promising free delivery above ₹1,199 on the sign-in page and ₹999
   * everywhere else. The titles alone: this panel is a reminder, not the
   * explanation.
   */
  const { valueProps } = await getSiteContent();
  const promises = valueProps.filter((prop) => prop.isActive).map((prop) => prop.title);

  return (
    <div className="bg-canvas min-h-dvh lg:grid lg:grid-cols-2">
      {/* ------------------------------------------------- the trust panel */}
      <aside className="bg-inverse text-on-inverse grain relative isolate hidden flex-col justify-between overflow-hidden p-10 lg:flex xl:p-14">
        {/*
          Two indigo blooms and a film of noise.

          A flat near-black rectangle beside a white form reads as an empty
          panel — which is what a placeholder looks like. These are the cheapest
          possible depth: two very low-chroma radial gradients at opposite
          corners, so the panel has a light source and a direction without
          carrying an image that would need art-directing per breakpoint and
          would cost a request on the one page where time-to-form matters most.

          The GRAIN is the half that is always missing. A large gradient on an
          8-bit panel bands into five visible steps on most laptop screens; 2.5%
          noise dithers the ramp and the banding disappears. It is invisible
          until it is removed.

          All of it is `aria-hidden` and `pointer-events-none`: this is
          lighting, not content, and nothing here may intercept a click meant
          for the lockup underneath.
        */}
        <div
          aria-hidden
          className="pointer-events-none absolute -left-24 -top-24 -z-10 size-[34rem] rounded-full bg-[radial-gradient(circle,var(--color-iris-600)_0%,transparent_62%)] opacity-45 blur-3xl motion-safe:animate-drift"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-32 -right-20 -z-10 size-[30rem] rounded-full bg-[radial-gradient(circle,var(--color-iris-800)_0%,transparent_65%)] opacity-55 blur-3xl"
        />
        {/*
          The lockup is written out here rather than reused from `BrandLockup`.

          That component paints itself with `text-ink` and `text-accent-ink`,
          which are correct on every surface in the app EXCEPT this one: the
          panel is the inverse surface, so `text-ink` would be near-black on
          near-black. Overriding those tokens from the outside with an arbitrary
          descendant selector is the kind of fix that survives exactly until
          someone changes the lockup's markup. Two spans is cheaper and honest.
        */}
        <Link
          href="/"
          aria-label={`${siteConfig.name} home`}
          className="relative flex w-fit items-center gap-2.5"
        >
          <BrandMark className="size-9" />
          <span className="inline-flex items-baseline gap-[0.2em]">
            <span className="font-display text-on-inverse text-xl font-bold leading-none tracking-[-0.045em]">
              Vestra
            </span>
            <span className="text-iris-300 text-2xs font-semibold uppercase leading-none tracking-[0.18em]">
              WAB
            </span>
          </span>
        </Link>

        <div className="relative max-w-md">
          {/*
            The colour is explicit, and it has to be.

            `@layer base` paints every h1-h6 with `--text-primary`, which is
            near-black — correct on a page, invisible on this panel. Any heading
            on an inverse surface carries its own colour class; `.headline`
            deliberately sets none, because a colour in that utility would
            outrank `text-ink` everywhere else in the app.
          */}
          <h2 className="headline text-on-inverse text-4xl xl:text-5xl">
            Marketplace for modern wardrobes
          </h2>
          <p className="mt-5 text-md text-current/70">{siteConfig.description}</p>

          <ul className="mt-9 space-y-3.5">
            {promises.map((promise) => (
              <li key={promise} className="flex items-start gap-3 text-sm text-current/80">
                <span
                  aria-hidden
                  className="bg-iris-400 mt-1.5 size-1.5 shrink-0 rounded-full"
                />
                {promise}
              </li>
            ))}
          </ul>
        </div>

        {/*
          No year here.

          Reading the clock during render is impure and the React compiler lint
          fails the build on it — see AGENTS.md. A copyright year is not worth
          making this layout dynamic for, and the footer already carries the
          full line on every storefront page.
        */}
        <p className="relative text-2xs text-current/50">{siteConfig.legalName}</p>
      </aside>

      {/* ------------------------------------------------------- the form */}
      <div className="flex min-h-dvh flex-col lg:min-h-0">
        <header className="gutter flex h-(--spacing-header) items-center lg:hidden">
          <Link href="/" aria-label={`${siteConfig.name} home`}>
            <BrandLockup size="sm" />
          </Link>
        </header>

        <main className="flex flex-1 items-start justify-center px-5 py-6 sm:items-center sm:py-10">
          <div className="w-full max-w-sm">{children}</div>
        </main>

        <footer className="gutter pb-8 pt-4">
          <p className="text-faint text-center text-2xs">
            By continuing you agree to our{' '}
            <Link
              href="/legal/terms"
              className="hover:text-accent-ink underline underline-offset-2"
            >
              terms
            </Link>{' '}
            and{' '}
            <Link
              href="/legal/privacy"
              className="hover:text-accent-ink underline underline-offset-2"
            >
              privacy policy
            </Link>
            .
          </p>
        </footer>
      </div>
    </div>
  );
}
