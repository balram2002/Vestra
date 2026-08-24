'use client';

import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { signIn } from '@/server/actions/auth';

/**
 * Sign-in form.
 *
 * Deliberately plain: a native `<form>` with an action, so it submits and works
 * before hydration. `useTransition` only adds the pending state on top.
 *
 * The error is a single message above the fields rather than per-field, because
 * the server intentionally does not say which half was wrong — telling the form
 * "no such email" would turn it into an account-enumeration tool.
 */
export function LoginForm({ next }: { next?: string }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const onSubmit = (formData: FormData) => {
    setError(null);
    startTransition(async () => {
      const result = await signIn({
        email: String(formData.get('email') ?? ''),
        password: String(formData.get('password') ?? ''),
        next,
      });
      // A successful sign-in redirects from the server, so reaching here at all
      // means it failed.
      if (result && !result.ok) setError(result.error ?? 'Could not sign you in.');
    });
  };

  return (
    <form action={onSubmit} className="space-y-4" noValidate>
      <div>
        <h1 className="font-display text-ink text-2xl">Sign in</h1>
        <p className="text-muted mt-1 text-sm">
          New here?{' '}
          <Link href="/register" className="text-accent-ink font-medium hover:underline">
            Create an account
          </Link>
        </p>
      </div>

      {error ? (
        <p
          role="alert"
          className="border-danger-100 bg-danger-50 text-danger-700 flex items-start gap-2 rounded-md border p-3 text-sm"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
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

      <div>
        <Input
          label="Password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
        <div className="mt-1.5 text-right">
          <Link
            href="/forgot-password"
            className="text-muted hover:text-accent-ink text-2xs underline-offset-2 hover:underline"
          >
            Forgot your password?
          </Link>
        </div>
      </div>

      <Button type="submit" size="cta" loading={pending}>
        Sign in
      </Button>

      {/*
        Demo credentials are shown on purpose: this build ships with a seeded
        dataset and no way to receive a verification email.
      */}
      <div className="border-line bg-sunken rounded-md border p-3">
        <p className="text-ink text-2xs font-semibold uppercase tracking-wider">Demo accounts</p>
        <ul className="text-muted mt-1.5 space-y-0.5 text-2xs">
          <li>Customer — ananya.iyer@example.com</li>
          <li>Seller — mora01@seller.vestra.test</li>
          <li>Admin — admin@vestra.test</li>
        </ul>
        <p className="text-faint mt-1.5 text-2xs">Password for all: vestra123</p>
      </div>
    </form>
  );
}
