'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { changePassword, updateProfile } from '@/server/actions/account';

type FieldErrors = Partial<Record<string, string>>;

function digits(value: string): string {
  return value.replace(/\D/g, '').replace(/^(?:91|0)(?=\d{10}$)/, '');
}

export function ProfileForm({
  fullName,
  email,
  phone,
  emailVerified,
}: {
  fullName: string;
  email: string;
  phone: string;
  emailVerified: boolean;
}) {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = {
      fullName: String(form.get('fullName') ?? '').trim(),
      phone: digits(String(form.get('phone') ?? '')),
    };

    setErrors({});
    startTransition(async () => {
      const result = await updateProfile(input);
      if (result.ok) toast.success('Details saved');
      else if (result.field) setErrors({ [result.field]: result.error });
      else toast.error(result.error ?? 'Could not save your details.');
    });
  };

  return (
    <form onSubmit={submit} noValidate className="mt-5 space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Full name"
          name="fullName"
          autoComplete="name"
          required
          maxLength={80}
          defaultValue={fullName}
          error={errors.fullName}
        />
        <Input
          label="Mobile number"
          name="phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          maxLength={14}
          defaultValue={phone}
          hint="Optional."
          error={errors.phone}
        />
      </div>
      <Input
        label="Email"
        name="email"
        type="email"
        value={email}
        readOnly
        disabled
        hint={
          emailVerified
            ? 'Verified. It is your sign-in, so support changes it for you.'
            : 'Not verified yet. The link is in your inbox.'
        }
      />
      <div className="flex justify-end">
        <Button type="submit" size="sm" loading={pending}>
          Save details
        </Button>
      </div>
    </form>
  );
}

export function PasswordForm({ email }: { email: string }) {
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, startTransition] = useTransition();
  // Remounting the form is what clears three password fields after a change.
  const [version, setVersion] = useState(0);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = {
      current: String(form.get('current') ?? ''),
      next: String(form.get('next') ?? ''),
      confirm: String(form.get('confirm') ?? ''),
    };

    setErrors({});
    startTransition(async () => {
      const result = await changePassword(input);
      if (result.ok) {
        toast.success('Password changed');
        setVersion((value) => value + 1);
      } else if (result.field) {
        setErrors({ [result.field]: result.error });
      } else {
        toast.error(result.error ?? 'Could not change your password.');
      }
    });
  };

  return (
    <form key={version} onSubmit={submit} noValidate className="mt-5 space-y-4">
      {/* Lets a password manager file the new password under the right account. */}
      <input type="email" name="username" autoComplete="username" value={email} readOnly hidden />
      <Input
        label="Current password"
        name="current"
        type="password"
        autoComplete="current-password"
        required
        error={errors.current}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="New password"
          name="next"
          type="password"
          autoComplete="new-password"
          required
          error={errors.next}
        />
        <Input
          label="Confirm new password"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
          error={errors.confirm}
        />
      </div>
      <div className="flex justify-end">
        <Button type="submit" size="sm" loading={pending}>
          Change password
        </Button>
      </div>
    </form>
  );
}