import Link from 'next/link';

/**
 * Auth shell.
 *
 * Its own route group, so sign-in does not inherit the storefront's mega menu
 * and footer. Someone on this page has one job; a full navigation is an
 * invitation to abandon it.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="bg-canvas flex min-h-dvh flex-col">
      <header className="gutter shell-max flex h-16 items-center">
        <Link href="/" className="font-display text-ink text-2xl leading-none">
          Vestra
        </Link>
      </header>

      <main className="flex flex-1 items-start justify-center px-4 py-8 sm:items-center">
        <div className="w-full max-w-sm">{children}</div>
      </main>

      <footer className="gutter shell-max py-6">
        <p className="text-faint text-center text-2xs">
          By continuing you agree to our{' '}
          <Link href="/legal/terms" className="hover:text-accent-ink underline underline-offset-2">
            terms
          </Link>{' '}
          and{' '}
          <Link href="/legal/privacy" className="hover:text-accent-ink underline underline-offset-2">
            privacy policy
          </Link>
          .
        </p>
      </footer>
    </div>
  );
}
