'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { INDIAN_STATES } from '@/config/business';
import { BUSINESS_TYPES } from '@/lib/validation/seller';
import {
  saveBankAccount,
  savePickupAddress,
  updateBusinessDetails,
  updateStoreProfile,
} from '@/server/actions/onboarding';

/**
 * The store's setup forms, one per section of the settings page.
 *
 * Each saves on its own, so a seller who has only their pickup address to hand
 * can add that and leave; nothing waits on the other three. The server action
 * validates and names the field an error belongs to, and the error appears
 * under that input.
 */

type Errors = Partial<Record<string, string>>;
type Save = (input: Record<string, string>) => Promise<{ ok: boolean; error?: string; field?: string }>;

function useSave(save: Save, success: string, onSaved?: () => void) {
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Errors>({});

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const input: Record<string, string> = {};
    for (const [key, value] of new FormData(event.currentTarget).entries()) {
      const text = String(value).trim();
      // A phone number typed as "+91 98xxx xxxxx" is still the ten digits.
      input[key] = /phone/i.test(key) ? text.replace(/\D/g, '').slice(-10) : text;
    }

    setErrors({});
    startTransition(async () => {
      const result = await save(input);
      if (result.ok) {
        toast.success(success);
        onSaved?.();
      } else if (result.field) {
        setErrors({ [result.field]: result.error });
      } else {
        toast.error(result.error ?? 'Could not save that.');
      }
    });
  };

  return { pending, errors, submit };
}

function Actions({ pending, children }: { pending: boolean; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap justify-end gap-2 pt-1">
      {children}
      <Button type="submit" size="sm" loading={pending}>
        Save
      </Button>
    </div>
  );
}

/* ----------------------------------------------------------- store profile */

export function StoreProfileForm({
  initial,
}: {
  initial: { tagline: string; about: string; supportEmail: string; supportPhone: string };
}) {
  const { pending, errors, submit } = useSave(updateStoreProfile, 'Store profile saved');

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Input
        label="Tagline"
        name="tagline"
        maxLength={90}
        defaultValue={initial.tagline}
        placeholder="Handloom cotton, made in Jaipur"
        hint="Optional. One line under your store name."
        error={errors.tagline}
      />
      <Textarea
        label="About your store"
        name="about"
        rows={4}
        maxLength={1200}
        defaultValue={initial.about}
        hint="What you make and how. Shown on your store page."
        error={errors.about}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Support email"
          name="supportEmail"
          type="email"
          autoComplete="email"
          defaultValue={initial.supportEmail}
          error={errors.supportEmail}
        />
        <Input
          label="Support phone"
          name="supportPhone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          leading="+91"
          defaultValue={initial.supportPhone}
          error={errors.supportPhone}
        />
      </div>
      <Actions pending={pending} />
    </form>
  );
}

/* -------------------------------------------------------- business and tax */

export function BusinessDetailsForm({
  initial,
}: {
  initial: { legalName: string; businessType: string; gstin: string; pan: string };
}) {
  const { pending, errors, submit } = useSave(updateBusinessDetails, 'Business details saved');

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Registered business name"
          name="legalName"
          maxLength={120}
          defaultValue={initial.legalName}
          hint="As on your GST certificate."
          error={errors.legalName}
        />
        <Select
          label="Business type"
          name="businessType"
          defaultValue={initial.businessType}
          error={errors.businessType}
        >
          {BUSINESS_TYPES.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </Select>
        <Input
          label="GSTIN"
          name="gstin"
          maxLength={15}
          autoCapitalize="characters"
          spellCheck={false}
          defaultValue={initial.gstin}
          placeholder="08ABCDE1234F1Z5"
          hint="15 characters, starting with your state code."
          error={errors.gstin}
          className="font-mono uppercase"
        />
        <Input
          label="PAN"
          name="pan"
          maxLength={10}
          autoCapitalize="characters"
          spellCheck={false}
          defaultValue={initial.pan}
          placeholder="ABCDE1234F"
          hint="Optional."
          error={errors.pan}
          className="font-mono uppercase"
        />
      </div>
      <Actions pending={pending} />
    </form>
  );
}

/* ---------------------------------------------------------- pickup address */

export function PickupAddressForm({
  initial,
}: {
  initial: {
    contactName: string;
    phone: string;
    line1: string;
    line2: string;
    city: string;
    state: string;
    pincode: string;
  };
}) {
  const { pending, errors, submit } = useSave(savePickupAddress, 'Pickup address saved');

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Contact name"
          name="contactName"
          autoComplete="name"
          defaultValue={initial.contactName}
          hint="Who the courier asks for."
          error={errors.contactName}
        />
        <Input
          label="Contact phone"
          name="phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          leading="+91"
          defaultValue={initial.phone}
          error={errors.phone}
        />
      </div>
      <Input
        label="Address"
        name="line1"
        autoComplete="address-line1"
        defaultValue={initial.line1}
        placeholder="Building, street"
        error={errors.line1}
      />
      <Input
        label="Area or landmark"
        name="line2"
        autoComplete="address-line2"
        defaultValue={initial.line2}
        hint="Optional."
        error={errors.line2}
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <Input
          label="City"
          name="city"
          autoComplete="address-level2"
          defaultValue={initial.city}
          error={errors.city}
        />
        <Select label="State" name="state" defaultValue={initial.state} error={errors.state}>
          <option value="">Choose…</option>
          {INDIAN_STATES.map((state) => (
            <option key={state} value={state}>
              {state}
            </option>
          ))}
        </Select>
        <Input
          label="Pincode"
          name="pincode"
          inputMode="numeric"
          autoComplete="postal-code"
          maxLength={6}
          defaultValue={initial.pincode}
          error={errors.pincode}
          className="tabular"
        />
      </div>
      <Actions pending={pending} />
    </form>
  );
}

/* ---------------------------------------------------------- payout account */

export function BankAccountForm({
  current,
}: {
  current: { holder: string; masked: string; ifsc: string; bankName: string } | null;
}) {
  const [editing, setEditing] = useState(current === null);
  const { pending, errors, submit } = useSave(saveBankAccount, 'Payout account saved', () =>
    setEditing(false),
  );

  if (current && !editing) {
    return (
      <div className="space-y-4">
        <dl className="divide-line divide-y text-sm">
          <Row label="Account holder" value={current.holder} />
          <Row label="Account" value={current.masked} mono />
          <Row label="IFSC" value={current.ifsc} mono />
          <Row label="Bank" value={current.bankName} />
        </dl>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-faint text-2xs">Only the last four digits are kept on file here.</p>
          <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(true)}>
            Change account
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Account holder name"
          name="accountHolderName"
          autoComplete="name"
          defaultValue={current?.holder}
          error={errors.accountHolderName}
        />
        <Input
          label="Bank name"
          name="bankName"
          defaultValue={current?.bankName}
          error={errors.bankName}
        />
        <Input
          label="Account number"
          name="accountNumber"
          inputMode="numeric"
          autoComplete="off"
          maxLength={18}
          hint="We keep only the last four digits here."
          error={errors.accountNumber}
          className="tabular"
        />
        <Input
          label="IFSC"
          name="ifsc"
          maxLength={11}
          autoCapitalize="characters"
          spellCheck={false}
          defaultValue={current?.ifsc}
          placeholder="HDFC0001234"
          error={errors.ifsc}
          className="font-mono uppercase"
        />
      </div>
      <Actions pending={pending}>
        {current ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => setEditing(false)} disabled={pending}>
            Cancel
          </Button>
        ) : null}
      </Actions>
    </form>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-muted text-xs">{label}</dt>
      <dd className={mono ? 'text-ink tabular text-xs' : 'text-ink text-xs'}>{value}</dd>
    </div>
  );
}
