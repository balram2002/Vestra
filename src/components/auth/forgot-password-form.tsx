'use client';

import { MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { siteConfig } from '@/config/site';
import { requestPasswordReset } from '@/server/actions/auth';

/**
 * Ask for a reset link.
 *
 * The confirmation is unconditional — "if an account exists, we have sent a
 * link" — because a message that differs for a known and an unknown address
 * turns this form into an account-enumeration tool. The server enforces that;
 * this only has to avoid undoing it, which means the success state must not
 * depend on anything the server said beyond `ok`.
 */
export function ForgotPasswordForm() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onSubmit = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const result = await requestPasswordReset({
        email: String(formData.get('email') ?? ''),
      });
      if (result.ok) setSent(true);
      else setError(result.fieldErrors?.email ?? result.error ?? 'That did not work.');
    });
  };

  if (sent) {
    return (
      <div className="space-y-4">
        <MailCheck className="text-success-600 size-8" aria-hidden />
        <div>
          <h1 className="font-display text-ink text-2xl">Check your inbox</h1>
          <p className="text-muted mt-2 text-sm">
            If an account exists for that address, a reset link is on its way. It works for the next
            30 minutes and can be used once.
          </p>
        </div>

        <p className="text-faint text-2xs">
          {siteConfig.supportEmail ? (
            <>
              Nothing arrived? Check your spam folder, or write to{' '}
              <a
                href={`mailto:${siteConfig.supportEmail}`}
                className="hover:text-accent-ink underline underline-offset-2"
              >
                {siteConfig.supportEmail}
              </a>{' '}
              and an agent will verify you by hand.
            </>
          ) : (
            'Nothing arrived? Check your spam folder, then ask for another link in a few minutes.'
          )}
        </p>

        <p className="text-muted text-center text-xs">
          <Link href="/login" className="hover:text-accent-ink underline underline-offset-2">
            Back to sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form action={onSubmit} className="space-y-4" noValidate>
      <div>
        <h1 className="font-display text-ink text-2xl">Reset your password</h1>
        <p className="text-muted mt-1 text-sm">
          Enter the email on your account and we will send you a reset link.
        </p>
      </div>

      {error ? (
        <p role="alert" className="text-danger-700 text-sm">
          {error}
        </p>
      ) : null}

      <Input
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        placeholder="you@example.com"
      />

      <Button type="submit" size="cta" disabled={pending}>
        {pending ? 'Sending…' : 'Send reset link'}
      </Button>

      <p className="text-muted text-center text-xs">
        <Link href="/login" className="hover:text-accent-ink underline underline-offset-2">
          Back to sign in
        </Link>
      </p>
    </form>
  );
}
