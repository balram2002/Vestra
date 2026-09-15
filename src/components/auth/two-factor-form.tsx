'use client';

import { MailCheck } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { CodeInput } from '@/components/ui/code-input';
import { cancelSignIn, resendSignInCode, verifySignInCode } from '@/server/actions/two-factor';

/**
 * The second step of signing in.
 *
 * Everything on this screen is about getting a person from their inbox back to
 * here with the least effort: the address the code went to (masked, but enough
 * to recognise), a field the phone can fill from the email, submission the
 * moment the sixth digit lands, and a resend that says exactly when it will be
 * available rather than silently doing nothing.
 *
 * A code that can no longer work -- five wrong tries, or the ten minutes gone --
 * does not leave the person typing into a dead form. The screen changes to the
 * one thing that will help, which is signing in again.
 */

const RESEND_AFTER_MS = 30_000;

export function TwoFactorForm({
  sentTo,
  sentAt,
  resendAt,
}: {
  sentTo: string;
  sentAt: string;
  resendAt: string;
}) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [restart, setRestart] = useState(false);
  const [availableAt, setAvailableAt] = useState(() => Date.parse(resendAt));
  // Starts at the moment the code was sent, from props, rather than reading the
  // clock during render; the first tick replaces it a second later.
  const [now, setNow] = useState(() => Date.parse(sentAt));
  const [pending, startTransition] = useTransition();
  const [resending, startResend] = useTransition();

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const secondsLeft = Math.max(0, Math.ceil((availableAt - now) / 1000));

  const submit = (value: string) => {
    if (pending || value.length !== 6) return;
    setError(null);
    setFieldError(null);
    setNotice(null);

    startTransition(async () => {
      const result = await verifySignInCode({ code: value });
      // A correct code redirects from the server, so arriving here means it was not.
      if (!result || result.ok) return;

      if (result.restart) {
        setRestart(true);
        setError(result.error ?? 'Sign in again to get a new code.');
        return;
      }
      if (result.field) setFieldError(result.error ?? 'That code is not right.');
      else setError(result.error ?? 'That did not work.');
      setCode('');
    });
  };

  const resend = () =>
    startResend(async () => {
      setError(null);
      setFieldError(null);
      setNotice(null);

      const result = await resendSignInCode();
      if (result.ok) {
        setCode('');
        setNotice(`A new code is on its way to ${result.sentTo}. The last one no longer works.`);
        setAvailableAt(Date.now() + RESEND_AFTER_MS);
        return;
      }
      if (result.restart) setRestart(true);
      if (result.retryAfterSeconds) setAvailableAt(Date.now() + result.retryAfterSeconds * 1000);
      setError(result.error ?? 'A new code could not be sent.');
    });

  if (restart) {
    return (
      <div className="space-y-4">
        <h1 className="font-display text-ink text-2xl">Sign in again</h1>
        <p role="alert" className="text-muted text-sm">
          {error}
        </p>
        <Button asChild size="cta">
          <Link href="/login">Back to sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        submit(code);
      }}
      className="space-y-5"
      noValidate
    >
      <div>
        <span className="bg-accent-soft text-accent-ink grid size-11 place-items-center rounded-full">
          <MailCheck className="size-5" aria-hidden />
        </span>
        <h1 className="font-display text-ink mt-4 text-2xl">Check your email</h1>
        <p className="text-muted mt-1 text-sm">
          We sent a 6-digit code to <span className="text-ink font-medium">{sentTo}</span>. It works
          for 10 minutes.
        </p>
      </div>

      {error ? (
        <p role="alert" className="border-danger-100 bg-danger-50 text-danger-700 rounded-md border p-3 text-sm">
          {error}
        </p>
      ) : null}
      {notice ? (
        <p role="status" className="bg-success-50 text-success-700 rounded-md p-3 text-sm">
          {notice}
        </p>
      ) : null}

      <CodeInput
        label="Sign-in code"
        name="code"
        value={code}
        onValueChange={(digits) => {
          setCode(digits);
          if (fieldError) setFieldError(null);
        }}
        onComplete={submit}
        error={fieldError ?? undefined}
        disabled={pending}
        autoFocus
      />

      <Button type="submit" size="cta" loading={pending} disabled={code.length !== 6}>
        Verify and sign in
      </Button>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-xs">
        <button
          type="button"
          onClick={resend}
          disabled={resending || secondsLeft > 0}
          className="text-accent-ink disabled:text-faint inline-flex min-h-11 items-center font-medium underline-offset-4 hover:underline disabled:no-underline lg:min-h-0"
        >
          {resending
            ? 'Sending…'
            : secondsLeft > 0
              ? `Send a new code in ${secondsLeft}s`
              : 'Send a new code'}
        </button>
        <button
          type="button"
          onClick={() =>
            startTransition(async () => {
              await cancelSignIn();
            })
          }
          className="text-muted hover:text-ink inline-flex min-h-11 items-center lg:min-h-0"
        >
          Use a different account
        </button>
      </div>

      <p className="text-faint text-2xs">
        Nothing there? Look in spam or promotions: the subject line starts with the code.
      </p>
    </form>
  );
}
