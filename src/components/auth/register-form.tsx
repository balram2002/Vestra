'use client';

import { AlertTriangle } from 'lucide-react';
import Link from 'next/link';
import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ACCOUNTS } from '@/config/business';
import { register } from '@/server/actions/auth';

/**
 * Registration.
 *
 * Only what is genuinely needed to create an account: name, email, password.
 * Phone is optional and clearly marked so, because every required field on a
 * signup form costs conversions, and a mobile number can be collected at
 * checkout where it actually earns its place (delivery updates).
 *
 * Marketing consent is opt-IN and unticked. That is both the lawful default and
 * the honest one.
 */
export function RegisterForm() {
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const onSubmit = (formData: FormData) => {
    setError(null);
    setFieldErrors({});

    startTransition(async () => {
      const result = await register({
        fullName: String(formData.get('fullName') ?? ''),
        email: String(formData.get('email') ?? ''),
        password: String(formData.get('password') ?? ''),
        phone: String(formData.get('phone') ?? ''),
        marketingOptIn: formData.get('marketingOptIn') === 'on',
      });

      if (result && !result.ok) {
        setError(result.error ?? 'Could not create your account.');
        setFieldErrors(result.fieldErrors ?? {});
      }
    });
  };

  return (
    <form action={onSubmit} className="space-y-4" noValidate>
      <div>
        <h1 className="font-display text-ink text-2xl">Create your account</h1>
        <p className="text-muted mt-1 text-sm">
          Already have one?{' '}
          <Link href="/login" className="text-accent-ink font-medium hover:underline">
            Sign in
          </Link>
        </p>
      </div>

      {error && Object.keys(fieldErrors).length === 0 ? (
        <p
          role="alert"
          className="border-danger-100 bg-danger-50 text-danger-700 flex items-start gap-2 rounded-md border p-3 text-sm"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      <Input
        label="Full name"
        name="fullName"
        autoComplete="name"
        required
        error={fieldErrors.fullName}
        placeholder="Ananya Iyer"
      />

      <Input
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        required
        error={fieldErrors.email}
        placeholder="you@example.com"
      />

      <Input
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        error={fieldErrors.password}
        hint={`At least ${ACCOUNTS.passwordMinLength} characters`}
      />

      <Input
        label="Mobile number (optional)"
        name="phone"
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        error={fieldErrors.phone}
        hint="Only used for delivery updates"
        placeholder="9876543210"
      />

      <label className="flex items-start gap-2 text-xs">
        <input
          type="checkbox"
          name="marketingOptIn"
          className="border-line-strong accent-[--accent-solid] mt-0.5 size-4 rounded-xs"
        />
        <span className="text-muted">
          Email me about new arrivals and sales. You can turn this off at any time.
        </span>
      </label>

      <Button type="submit" size="cta" loading={pending}>
        Create account
      </Button>
    </form>
  );
}
