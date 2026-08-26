'use client';

import { AlertTriangle } from 'lucide-react';
import { useState, useTransition } from 'react';

import { INDIAN_STATES } from '@/config/business';
import { submitApplication } from '@/server/actions/onboarding';

import { Field, Section } from './listing-fields';

/**
 * The seller application.
 *
 * One page, not a wizard. Every field here is something an applicant already
 * has to hand — a GSTIN, a PAN, a bank account — and splitting them across five
 * steps turns a fifteen-minute job into an abandoned one. The documents come
 * afterwards, on the onboarding screen, because those need scanning.
 */

const BUSINESS_TYPES = [
  { value: 'PROPRIETORSHIP', label: 'Sole proprietorship' },
  { value: 'PARTNERSHIP', label: 'Partnership firm' },
  { value: 'LLP', label: 'Limited liability partnership' },
  { value: 'PRIVATE_LIMITED', label: 'Private limited company' },
  { value: 'INDIVIDUAL', label: 'Individual' },
] as const;

export function SellerApplicationForm({
  categories,
}: {
  categories: Array<{ id: string; name: string }>;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState({
    displayName: '',
    tagline: '',
    about: '',
    legalName: '',
    businessType: 'PROPRIETORSHIP' as (typeof BUSINESS_TYPES)[number]['value'],
    gstin: '',
    pan: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    pincode: '',
    supportEmail: '',
    supportPhone: '',
    accountHolderName: '',
    accountNumber: '',
    ifsc: '',
    bankName: '',
  });
  const [categoryIds, setCategoryIds] = useState<string[]>([]);

  const set = (field: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [field]: value }));

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await submitApplication({ ...form, categoryIds });
      // A success redirects from the server, so reaching here means it failed.
      if (result && !result.ok) setError(result.error ?? 'Could not submit your application.');
    });
  };

  return (
    <div className="space-y-6">
      {error ? (
        <p
          role="alert"
          className="border-danger-100 bg-danger-50 text-danger-700 flex items-start gap-2 rounded-md border p-3 text-sm"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          {error}
        </p>
      ) : null}

      <Section title="Your store" description="What shoppers will see.">
        <Field label="Store name" hint="This is how you appear across Vestra.">
          <input
            value={form.displayName}
            onChange={(event) => set('displayName', event.target.value)}
            maxLength={60}
            placeholder="Mora Label"
            className="border-line-strong bg-canvas text-ink h-9 w-full rounded-sm border px-2.5 text-sm"
          />
        </Field>

        <Field label="Tagline (optional)">
          <input
            value={form.tagline}
            onChange={(event) => set('tagline', event.target.value)}
            maxLength={90}
            placeholder="Handloom cotton, made in Jaipur"
            className="border-line-strong bg-canvas text-ink h-9 w-full rounded-sm border px-2.5 text-sm"
          />
        </Field>

        <Field label="About your store" hint="Two or three sentences about what you make.">
          <textarea
            value={form.about}
            onChange={(event) => set('about', event.target.value)}
            rows={4}
            maxLength={1200}
            className="border-line-strong bg-canvas text-ink w-full rounded-sm border px-2.5 py-2 text-sm"
          />
        </Field>

        <Field label="Categories you want to list in" hint="You can ask for more later.">
          <div className="max-h-56 overflow-y-auto rounded-sm border border-line-strong p-2">
            {categories.map((category) => {
              const selected = categoryIds.includes(category.id);
              return (
                <label key={category.id} className="flex cursor-pointer items-center gap-2 py-1">
                  <input
                    type="checkbox"
                    checked={selected}
                    onChange={() =>
                      setCategoryIds(
                        selected
                          ? categoryIds.filter((id) => id !== category.id)
                          : [...categoryIds, category.id],
                      )
                    }
                    className="accent-ink size-4 shrink-0"
                  />
                  <span className="text-ink text-xs">{category.name}</span>
                </label>
              );
            })}
          </div>
        </Field>
      </Section>

      <Section title="Your business" description="As registered. We verify this before you go live.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Registered business name">
            <input
              value={form.legalName}
              onChange={(event) => set('legalName', event.target.value)}
              className="border-line-strong bg-canvas text-ink h-9 w-full rounded-sm border px-2.5 text-sm"
            />
          </Field>

          <Field label="Business type">
            <select
              value={form.businessType}
              onChange={(event) => set('businessType', event.target.value)}
              className="border-line-strong bg-canvas text-ink h-9 w-full rounded-sm border px-2 text-sm"
            >
              {BUSINESS_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </select>
          </Field>

          <Field label="GSTIN" hint="15 characters, starting with your state code.">
            <input
              value={form.gstin}
              onChange={(event) => set('gstin', event.target.value.toUpperCase())}
              maxLength={15}
              placeholder="08ABCDE1234F1Z5"
              className="border-line-strong bg-canvas text-ink h-9 w-full rounded-sm border px-2.5 font-mono text-sm"
            />
          </Field>

          <Field label="PAN">
            <input
              value={form.pan}
              onChange={(event) => set('pan', event.target.value.toUpperCase())}
              maxLength={10}
              placeholder="ABCDE1234F"
              className="border-line-strong bg-canvas text-ink h-9 w-full rounded-sm border px-2.5 font-mono text-sm"
            />
          </Field>
        </div>
      </Section>

      <Section
        title="Pickup address"
        description="Where couriers collect from. It must match the state on your GSTIN."
      >
        <Field label="Address">
          <input
            value={form.addressLine1}
            onChange={(event) => set('addressLine1', event.target.value)}
            className="border-line-strong bg-canvas text-ink h-9 w-full rounded-sm border px-2.5 text-sm"
          />
        </Field>
        <Field label="Area (optional)">
          <input
            value={form.addressLine2}
            onChange={(event) => set('addressLine2', event.target.value)}
            className="border-line-strong bg-canvas text-ink h-9 w-full rounded-sm border px-2.5 text-sm"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="City">
            <input
              value={form.city}
              onChange={(event) => set('city', event.target.value)}
              className="border-line-strong bg-canvas text-ink h-9 w-full rounded-sm border px-2.5 text-sm"
            />
          </Field>
          <Field label="State">
            <select
              value={form.state}
              onChange={(event) => set('state', event.target.value)}
              className="border-line-strong bg-canvas text-ink h-9 w-full rounded-sm border px-2 text-sm"
            >
              <option value="">Choose…</option>
              {INDIAN_STATES.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Pincode">
            <input
              value={form.pincode}
              onChange={(event) => set('pincode', event.target.value.replace(/\D/g, '').slice(0, 6))}
              inputMode="numeric"
              className="border-line-strong bg-canvas text-ink tabular h-9 w-full rounded-sm border px-2.5 text-sm"
            />
          </Field>
        </div>
      </Section>

      <Section title="Contact and payouts" description="Where shoppers reach you, and where we settle.">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Support email">
            <input
              type="email"
              value={form.supportEmail}
              onChange={(event) => set('supportEmail', event.target.value)}
              className="border-line-strong bg-canvas text-ink h-9 w-full rounded-sm border px-2.5 text-sm"
            />
          </Field>
          <Field label="Support phone">
            <input
              value={form.supportPhone}
              onChange={(event) =>
                set('supportPhone', event.target.value.replace(/\D/g, '').slice(0, 10))
              }
              inputMode="numeric"
              className="border-line-strong bg-canvas text-ink tabular h-9 w-full rounded-sm border px-2.5 text-sm"
            />
          </Field>
          <Field label="Account holder name">
            <input
              value={form.accountHolderName}
              onChange={(event) => set('accountHolderName', event.target.value)}
              className="border-line-strong bg-canvas text-ink h-9 w-full rounded-sm border px-2.5 text-sm"
            />
          </Field>
          <Field label="Bank name">
            <input
              value={form.bankName}
              onChange={(event) => set('bankName', event.target.value)}
              className="border-line-strong bg-canvas text-ink h-9 w-full rounded-sm border px-2.5 text-sm"
            />
          </Field>
          <Field label="Account number" hint="We store only the last four digits.">
            <input
              value={form.accountNumber}
              onChange={(event) =>
                set('accountNumber', event.target.value.replace(/\D/g, '').slice(0, 18))
              }
              inputMode="numeric"
              className="border-line-strong bg-canvas text-ink tabular h-9 w-full rounded-sm border px-2.5 text-sm"
            />
          </Field>
          <Field label="IFSC">
            <input
              value={form.ifsc}
              onChange={(event) => set('ifsc', event.target.value.toUpperCase().slice(0, 11))}
              className="border-line-strong bg-canvas text-ink h-9 w-full rounded-sm border px-2.5 font-mono text-sm"
            />
          </Field>
        </div>
      </Section>

      <div className="border-line bg-raised flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
        <p className="text-muted text-xs">
          Next you will upload four documents. Most applications are reviewed within two working
          days.
        </p>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="bg-ink text-canvas disabled:bg-line-strong shrink-0 rounded-md px-4 py-2 text-xs font-medium disabled:cursor-wait"
        >
          {pending ? 'Submitting…' : 'Continue to documents'}
        </button>
      </div>
    </div>
  );
}
