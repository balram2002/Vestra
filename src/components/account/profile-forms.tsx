'use client';

import { Camera, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { ThemeToggle } from '@/components/theme/theme-toggle';
import { Avatar } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/choice';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { SIZE_SCALES } from '@/domain/attributes';
import { writePreferredSizes } from '@/hooks/use-preferred-size';
import { GENDER_OPTIONS, PREFERENCE_SIZE_SYSTEMS } from '@/lib/validation/profile';
import {
  changePassword,
  removeAvatar,
  updatePreferences,
  updateProfile,
  uploadAvatar,
} from '@/server/actions/account';

type FieldErrors = Partial<Record<string, string>>;

function digits(value: string): string {
  return value.replace(/\D/g, '').replace(/^(?:91|0)(?=\d{10}$)/, '');
}

/* ------------------------------------------------------------------ photo */

/** Larger than any avatar on screen at 2x, small enough to upload in a moment. */
const AVATAR_PIXELS = 512;

/**
 * The middle square of a photo, scaled down in the browser before it is sent.
 *
 * A phone photograph is 4MB of 4000 pixels that will only ever be shown at 80.
 * Cropping and scaling here means the upload is a few dozen kilobytes, it is
 * square so every avatar frame shows the same thing, and the server receives
 * an image it did not have to decode to use. WebP where the browser can encode
 * it, JPEG where it cannot.
 */
async function squareCrop(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const output = Math.min(AVATAR_PIXELS, side);

  const canvas = document.createElement('canvas');
  canvas.width = output;
  canvas.height = output;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('No canvas');

  context.imageSmoothingQuality = 'high';
  context.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    output,
    output,
  );
  bitmap.close();

  const encode = (type: string) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, 0.9));

  const webp = await encode('image/webp');
  if (webp?.type === 'image/webp') return webp;
  const jpeg = await encode('image/jpeg');
  if (!jpeg) throw new Error('Could not encode');
  return jpeg;
}

export function AvatarEditor({ name, avatarUrl }: { name: string; avatarUrl: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  // A local copy of the chosen photo, shown while it uploads and until the
  // page's own data catches up.
  const [preview, setPreview] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const hasPhoto = Boolean(preview ?? avatarUrl);

  const choose = (file: File | undefined) => {
    if (input.current) input.current.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Choose a photo: JPEG, PNG, WebP or AVIF.');
      return;
    }

    startTransition(async () => {
      const square = await squareCrop(file).catch(() => null);
      if (!square) {
        toast.error('That photo could not be read. Try a JPEG or PNG.');
        return;
      }

      const local = URL.createObjectURL(square);
      setPreview(local);

      const form = new FormData();
      const extension = square.type === 'image/webp' ? 'webp' : 'jpg';
      form.set('file', new File([square], `avatar.${extension}`, { type: square.type }));

      const result = await uploadAvatar(form);
      if (!result.ok) {
        setPreview(null);
        URL.revokeObjectURL(local);
        toast.error(result.error ?? 'That photo did not upload.');
        return;
      }

      toast.success('Photo updated');
      router.refresh();
    });
  };

  const remove = () =>
    startTransition(async () => {
      const result = await removeAvatar();
      if (!result.ok) {
        toast.error(result.error ?? 'Could not remove your photo.');
        return;
      }
      setPreview(null);
      toast.success('Photo removed');
      router.refresh();
    });

  return (
    <div className="flex flex-wrap items-center gap-4">
      <div className="relative size-20 shrink-0">
        {preview ? (
          // A local object URL that exists only in this browser, which the
          // image optimiser cannot fetch.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="" className="size-20 rounded-full object-cover" />
        ) : (
          <Avatar name={name} src={avatarUrl} size="xl" />
        )}
        {pending ? (
          <span className="absolute inset-0 grid place-items-center rounded-full bg-black/45">
            <Loader2 className="size-5 animate-spin text-white" aria-hidden />
            <span className="sr-only">Saving your photo</span>
          </span>
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <p className="text-ink text-sm font-medium">Profile photo</p>
        <p className="text-muted mt-0.5 text-xs">
          The middle of your photo, as a square. Shown on your account and in the menu.
        </p>
        <div className="mt-2.5 flex flex-wrap gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            disabled={pending}
            onClick={() => input.current?.click()}
          >
            <Camera className="size-4" aria-hidden />
            {hasPhoto ? 'Change photo' : 'Add a photo'}
          </Button>
          {hasPhoto ? (
            <ConfirmDialog
              trigger={
                <Button type="button" size="sm" variant="ghost" disabled={pending}>
                  Remove
                </Button>
              }
              title="Remove your photo?"
              description="Your initials show instead, everywhere the photo appeared."
              confirmLabel="Remove photo"
              tone="danger"
              onConfirm={remove}
            />
          ) : null}
        </div>
        <input
          ref={input}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          className="sr-only"
          tabIndex={-1}
          aria-label="Choose a profile photo"
          onChange={(event) => choose(event.target.files?.[0])}
        />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- details */

export function ProfileForm({
  fullName,
  email,
  phone,
  emailVerified,
  gender,
  dateOfBirth,
}: {
  fullName: string;
  email: string;
  phone: string;
  emailVerified: boolean;
  gender: string;
  dateOfBirth: string;
}) {
  const router = useRouter();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, startTransition] = useTransition();

  // An error goes the moment its field is touched, not on the next submit.
  const clear = (field: string) => {
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const input = {
      fullName: String(form.get('fullName') ?? '').trim(),
      phone: digits(String(form.get('phone') ?? '')),
      gender: String(form.get('gender') ?? ''),
      dateOfBirth: String(form.get('dateOfBirth') ?? ''),
    };

    setErrors({});
    startTransition(async () => {
      const result = await updateProfile(input);
      if (result.ok) {
        toast.success('Details saved');
        router.refresh();
      } else if (result.field) {
        setErrors({ [result.field]: result.error });
      } else {
        toast.error(result.error ?? 'Could not save your details.');
      }
    });
  };

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Input
          label="Full name"
          name="fullName"
          autoComplete="name"
          required
          maxLength={80}
          defaultValue={fullName}
          error={errors.fullName}
          onChange={() => clear('fullName')}
        />
        <Input
          label="Mobile number"
          name="phone"
          type="tel"
          inputMode="numeric"
          autoComplete="tel-national"
          maxLength={14}
          leading="+91"
          defaultValue={phone}
          hint="Optional. For delivery updates."
          error={errors.phone}
          onChange={() => clear('phone')}
        />
        <Select
          label="Gender"
          name="gender"
          defaultValue={gender}
          hint="Optional."
          error={errors.gender}
          onChange={() => clear('gender')}
        >
          <option value="">Not set</option>
          {GENDER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </Select>
        <Input
          label="Date of birth"
          name="dateOfBirth"
          type="date"
          defaultValue={dateOfBirth}
          hint="Optional. Never shown to anyone."
          error={errors.dateOfBirth}
          onChange={() => clear('dateOfBirth')}
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

/* ------------------------------------------------------------ preferences */

/** Blank sizes dropped and keys in order, so "nothing changed" compares equal. */
function canonical(sizes: Record<string, string>): string {
  return JSON.stringify(
    Object.entries(sizes)
      .filter(([, size]) => size)
      .sort(([a], [b]) => a.localeCompare(b)),
  );
}

export function PreferencesForm({
  marketingOptIn,
  preferredSizes,
}: {
  marketingOptIn: boolean;
  preferredSizes: Record<string, string>;
}) {
  const router = useRouter();
  const [optIn, setOptIn] = useState(marketingOptIn);
  const [sizes, setSizes] = useState<Record<string, string>>(preferredSizes);
  const [pending, startTransition] = useTransition();

  const savedKey = canonical(preferredSizes);
  const dirty = optIn !== marketingOptIn || canonical(sizes) !== savedKey;

  /*
   * Keep this browser's copy in step with the account.
   *
   * Visiting the profile on a new phone is what gives that phone the "your
   * usual size" hint on product pages. Writing to storage is not React state,
   * so this effect renders nothing twice.
   */
  useEffect(() => {
    writePreferredSizes(Object.fromEntries(JSON.parse(savedKey) as Array<[string, string]>));
  }, [savedKey]);

  const save = () =>
    startTransition(async () => {
      const result = await updatePreferences({ marketingOptIn: optIn, preferredSizes: sizes });
      if (!result.ok) {
        toast.error(result.error ?? 'Could not save your preferences.');
        return;
      }
      writePreferredSizes(result.data?.preferredSizes ?? {});
      toast.success('Preferences saved');
      router.refresh();
    });

  return (
    <div className="space-y-5">
      <Switch
        label="New arrivals and sales, by email"
        description="Orders, deliveries and account emails always reach you. This is only the promotional ones."
        checked={optIn}
        onChange={(event) => setOptIn(event.target.checked)}
      />

      <div className="border-line border-t pt-4">
        <p className="text-ink text-sm font-medium">Your usual sizes</p>
        <p className="text-muted mt-0.5 text-xs">
          Product pages point them out, so you can see at a glance whether your size is in stock.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {PREFERENCE_SIZE_SYSTEMS.map(({ system, label, hint }) => (
            <Select
              key={system}
              label={label}
              hint={hint}
              value={sizes[system] ?? ''}
              onChange={(event) => {
                const size = event.target.value;
                setSizes((current) => ({ ...current, [system]: size }));
              }}
            >
              <option value="">No preference</option>
              {SIZE_SCALES[system].sizes.map((size) => (
                <option key={size} value={size}>
                  {size}
                </option>
              ))}
            </Select>
          ))}
        </div>
      </div>

      <div className="border-line flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <div className="min-w-0">
          <p className="text-ink text-sm font-medium">Appearance</p>
          <p className="text-muted mt-0.5 text-xs">
            Remembered on this device. System follows your phone or computer.
          </p>
        </div>
        <ThemeToggle />
      </div>

      <div className="flex items-center justify-end gap-3">
        {dirty ? <span className="text-faint text-2xs">Unsaved changes</span> : null}
        <Button type="button" size="sm" loading={pending} disabled={!dirty} onClick={save}>
          Save preferences
        </Button>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- password */

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
