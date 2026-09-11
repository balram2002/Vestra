'use client';

import { AlertTriangle, Check } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { INDIAN_STATES } from '@/config/business';
import { cn } from '@/lib/cn';
import { BUSINESS_TYPES } from '@/lib/validation/seller';
import { resubmitApplication, submitApplication } from '@/server/actions/onboarding';

/**
 * The seller application.
 *
 * Business details and nothing else: the store's name, the kind of business
 * behind it, how to reach them, where they are and what they sell. About two
 * minutes, and all of it things an applicant knows without looking anything
 * up. Tax numbers, a pickup address and a bank account are asked for in the
 * console once the store is approved, each when it is first needed.
 *
 * Given `initial`, it is the correction form for a rejected application and
 * sends the application again instead of creating one.
 */

export interface ApplicationDefaults {
  displayName: string;
  businessType: string;
  supportEmail: string;
  supportPhone: string;
  city: string;
  state: string;
  categoryIds: string[];
  gstin: string;
}

export function SellerApplicationForm({
  departments,
  initial,
  email,
}: {
  departments: Array<{ id: string; name: string }>;
  initial?: ApplicationDefaults;
  /** The account's email, offered as the contact address. */
  email?: string;
}) {
  const resubmitting = Boolean(initial);
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<string[]>(initial?.categoryIds ?? []);

  const toggle = (id: string) =>
    setChosen((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const read = (key: string) => String(form.get(key) ?? '').trim();

    const input = {
      displayName: read('displayName'),
      businessType: read('businessType'),
      supportEmail: read('supportEmail'),
      supportPhone: read('supportPhone').replace(/\D/g, '').slice(-10),
      city: read('city'),
      state: read('state'),
      categoryIds: chosen,
      gstin: read('gstin').toUpperCase(),
    };

    setErrors({});
    setFormError(null);
    startTransition(async () => {
      const result = resubmitting ? await resubmitApplication(input) : await submitApplication(input);
      // A new application redirects from the server; reaching here with ok is a resubmission.
      if (result?.ok) {
        toast.success('Sent again. We will look at it within two working days.');
        return;
      }
      if (result?.field) setErrors({ [result.field]: result.error });
      else setFormError(result?.error ?? 'Could not send your application.');
    });
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-7">
      {formError ? (
        <p
          role="alert"
          className="border-danger-100 bg-danger-50 text-danger-700 flex items-start gap-2 rounded-md border p-3 text-sm"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {formError}
        </p>
      ) : null}

      <fieldset className="space-y-4">
        <legend className="text-ink mb-3 text-md font-semibold">Your business</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Store name"
            name="displayName"
            required
            maxLength={60}
            defaultValue={initial?.displayName}
            placeholder="Mora Label"
            hint="How shoppers will see you."
            error={errors.displayName}
          />
          <Select
            label="Business type"
            name="businessType"
            defaultValue={initial?.businessType ?? 'INDIVIDUAL'}
            error={errors.businessType}
          >
            {BUSINESS_TYPES.map((type) => (
              <option key={type.value} value={type.value}>
                {type.label}
              </option>
            ))}
          </Select>
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-ink mb-3 text-md font-semibold">How we reach you</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Email"
            name="supportEmail"
            type="email"
            required
            autoComplete="email"
            defaultValue={initial?.supportEmail ?? email}
            error={errors.supportEmail}
          />
          <Input
            label="Mobile number"
            name="supportPhone"
            type="tel"
            required
            inputMode="numeric"
            autoComplete="tel-national"
            leading="+91"
            defaultValue={initial?.supportPhone}
            error={errors.supportPhone}
          />
        </div>
      </fieldset>

      <fieldset className="space-y-4">
        <legend className="text-ink mb-3 text-md font-semibold">Where you are</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="City"
            name="city"
            required
            autoComplete="address-level2"
            defaultValue={initial?.city}
            error={errors.city}
          />
          <Select label="State" name="state" required defaultValue={initial?.state ?? ''} error={errors.state}>
            <option value="">Choose…</option>
            {INDIAN_STATES.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </Select>
        </div>
      </fieldset>

      <fieldset>
        <legend className="text-ink text-md font-semibold">What do you sell?</legend>
        <p className="text-muted mt-1 text-xs">
          Choose all that apply. Once approved, you can list anything inside them.
        </p>

        {departments.length > 0 ? (
          <div className="mt-3 flex flex-wrap gap-2">
            {departments.map((department) => {
              const on = chosen.includes(department.id);
              return (
                <button
                  key={department.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggle(department.id)}
                  className={cn(
                    'inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 text-sm transition-colors',
                    'focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-2',
                    on
                      ? 'border-accent-control bg-accent-soft text-accent-ink font-medium'
                      : 'border-line-strong text-ink hover:border-ink',
                  )}
                >
                  {on ? <Check className="size-3.5" aria-hidden /> : null}
                  {department.name}
                </button>
              );
            })}
          </div>
        ) : (
          <p className="text-muted mt-3 text-sm">
            The shop has no departments yet, so applications cannot be taken. Please try again later.
          </p>
        )}

        {errors.categoryIds ? (
          <p role="alert" className="text-danger-700 mt-2 text-xs">
            {errors.categoryIds}
          </p>
        ) : null}
      </fieldset>

      <fieldset>
        <legend className="sr-only">Tax</legend>
        <Input
          label="GSTIN"
          name="gstin"
          maxLength={15}
          autoCapitalize="characters"
          spellCheck={false}
          defaultValue={initial?.gstin}
          placeholder="08ABCDE1234F1Z5"
          hint="Optional. If you have one to hand; otherwise add it after you are approved."
          error={errors.gstin}
          className="font-mono uppercase"
        />
      </fieldset>

      <div className="border-line flex flex-wrap items-center justify-between gap-3 border-t pt-5">
        <p className="text-muted max-w-sm text-xs">
          We review applications within two working days and let you know either way. Applying is
          free.
        </p>
        <Button type="submit" loading={pending} disabled={departments.length === 0}>
          {resubmitting ? 'Send it again' : 'Send application'}
        </Button>
      </div>
    </form>
  );
}
