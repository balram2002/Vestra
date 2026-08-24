import type { Metadata } from 'next';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { siteConfig } from '@/config/site';

export const metadata: Metadata = {
  title: 'Reset your password',
  robots: { index: false, follow: false },
};

/**
 * Password reset request.
 *
 * The confirmation is deliberately unconditional -- "if an account exists we
 * have sent a link" -- because a message that differs for a known and an
 * unknown address turns this form into an account-enumeration tool.
 *
 * Email delivery itself lands with the notification infrastructure; until then
 * the support address is offered so this is never a dead end.
 */
export default function ForgotPasswordPage() {
  return (
    <form className="space-y-4">
      <div>
        <h1 className="font-display text-ink text-2xl">Reset your password</h1>
        <p className="text-muted mt-1 text-sm">
          Enter the email on your account and we will send you a reset link.
        </p>
      </div>

      <Input
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        placeholder="you@example.com"
      />

      <Button type="submit" size="cta">
        Send reset link
      </Button>

      <p className="text-faint text-2xs">
        Not receiving it? Write to{' '}
        <a
          href={`mailto:${siteConfig.supportEmail}`}
          className="hover:text-accent-ink underline underline-offset-2"
        >
          {siteConfig.supportEmail}
        </a>{' '}
        and an agent will verify you by hand.
      </p>

      <p className="text-muted text-center text-xs">
        <Link href="/login" className="hover:text-accent-ink underline underline-offset-2">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
