'use client';

import { CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { PasswordInput } from './password-input';
import { resetPassword } from '@/server/actions/auth';

/**
 * Choose a new password.
 *
 * The token comes from the URL and is passed straight back to the server, which
 * is the only thing that can judge it. Nothing here tries to pre-validate it:
 * a link that looks well-formed and is expired must fail with the server's
 * reason, not with a guess.
 */
export function ResetPasswordForm({ token }: { token: string }) {
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onSubmit = (formData: FormData) => {
    setError(null);
    setFieldError(null);

    const password = String(formData.get('password') ?? '');
    const confirm = String(formData.get('confirm') ?? '');

    /*
     * Checked here rather than on the server: the confirmation field never
     * reaches it. Its only job is to catch a typo before the token is spent,
     * because the token is single-use and a mismatch would burn it.
     */
    if (password !== confirm) {
      setFieldError('Those two do not match.');
      return;
    }

    startTransition(async () => {
      const result = await resetPassword({ token, password });
      if (result.ok) setDone(true);
      else {
        setFieldError(result.fieldErrors?.password ?? null);
        setError(result.fieldErrors?.password ? null : (result.error ?? 'That did not work.'));
      }
    });
  };

  if (done) {
    return (
      <div className="space-y-4">
        <CheckCircle2 className="text-success-600 size-8" aria-hidden />
        <div>
          <h1 className="font-display text-ink text-2xl">Password changed</h1>
          <p className="text-muted mt-2 text-sm">
            You can sign in with your new password now. We have emailed you to confirm the change.
          </p>
        </div>
        <Link
          href="/login"
          className="bg-ink text-canvas inline-flex items-center justify-center rounded-md px-5 py-3 text-sm font-medium"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <form action={onSubmit} className="space-y-5">
      <div>
        <h1 className="font-display text-ink text-2xl">Choose a new password</h1>
        <p className="text-muted mt-1 text-sm">
          Your current password stays active until you set this one.
        </p>
      </div>

      {error ? (
        <p role="alert" className="text-danger-700 text-sm">
          {error}{' '}
          <Link href="/forgot-password" className="underline underline-offset-2">
            Ask for a new link
          </Link>
          .
        </p>
      ) : null}

      <PasswordInput strength
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        error={fieldError ?? undefined}
      />

      <PasswordInput label="Confirm new password" name="confirm" type="password" autoComplete="new-password" required />

      <Button type="submit" size="cta" disabled={pending}>
        {pending ? 'Saving…' : 'Change my password'}
      </Button>
    </form>
  );
}
