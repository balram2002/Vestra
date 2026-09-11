'use client';

import { Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { useId, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button, type ButtonProps } from '@/components/ui/button';
import { Switch } from '@/components/ui/choice';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { Select } from '@/components/ui/select';
import { INDIAN_STATES } from '@/config/business';
import type { Address, AddressLabel } from '@/domain/types';
import type { AddressInput } from '@/lib/validation/address';
import { deleteAddress, saveAddress, setDefaultAddress } from '@/server/actions/account';

/**
 * The address book's controls.
 *
 * One dialog for adding and editing, used on the address page AND inline at
 * checkout. The address page's button used to be permanently disabled while
 * checkout sent a signed-in shopper with no saved address to that very page,
 * so a new customer could not buy anything at all.
 *
 * The form remounts on every open (a new key), so a second address never
 * starts with the first one's fields or errors. The server validates; its
 * error lands under the field it belongs to.
 */

const LABELS: ReadonlyArray<{ value: AddressLabel; label: string }> = [
  { value: 'HOME', label: 'Home' },
  { value: 'WORK', label: 'Work' },
  { value: 'OTHER', label: 'Other' },
];

type FieldErrors = Partial<Record<string, string>>;

/** Keep the ten digits of an Indian mobile, whatever was pasted around them. */
function digits(value: string): string {
  return value.replace(/\D/g, '').replace(/^(?:91|0)(?=\d{10}$)/, '');
}

export function AddressFormDialog({
  address,
  label,
  size = 'sm',
  variant,
  className,
  defaultName,
  defaultPhone,
  onSaved,
}: {
  /** Present to edit, absent to add. */
  address?: Address;
  label?: string;
  size?: ButtonProps['size'];
  variant?: ButtonProps['variant'];
  className?: string;
  defaultName?: string;
  defaultPhone?: string;
  /** Checkout selects the new address the moment it is saved. */
  onSaved?: (address: Address) => void;
}) {
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(0);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setKey((value) => value + 1);
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        {address ? (
          <Button size="xs" variant={variant ?? 'ghost'} className={className}>
            <Pencil className="size-3.5" aria-hidden />
            {label ?? 'Edit'}
          </Button>
        ) : (
          <Button size={size} variant={variant ?? 'secondary'} className={className}>
            <Plus className="size-4" aria-hidden />
            {label ?? 'Add address'}
          </Button>
        )}
      </DialogTrigger>
      <AddressForm
        key={key}
        address={address}
        defaultName={defaultName}
        defaultPhone={defaultPhone}
        onDone={(saved) => {
          setOpen(false);
          onSaved?.(saved);
        }}
      />
    </Dialog>
  );
}

function AddressForm({
  address,
  defaultName,
  defaultPhone,
  onDone,
}: {
  address?: Address;
  defaultName?: string;
  defaultPhone?: string;
  onDone: (address: Address) => void;
}) {
  const formId = useId();
  const [kind, setKind] = useState<AddressLabel>(address?.label ?? 'HOME');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const text = (key: string) => String(form.get(key) ?? '').trim();

    const input: AddressInput & { id?: string } = {
      id: address?.id,
      label: kind,
      fullName: text('fullName'),
      phone: digits(text('phone')),
      alternatePhone: digits(text('alternatePhone')),
      line1: text('line1'),
      line2: text('line2'),
      landmark: text('landmark'),
      city: text('city'),
      state: text('state') as AddressInput['state'],
      pincode: text('pincode'),
      isDefault: form.get('isDefault') === 'on',
    };

    setErrors({});
    startTransition(async () => {
      const result = await saveAddress(input);
      if (result.ok && result.data) {
        toast.success(address ? 'Address updated' : 'Address saved');
        onDone(result.data);
      } else if (result.field) {
        setErrors({ [result.field]: result.error });
      } else {
        toast.error(result.error ?? 'Could not save the address.');
      }
    });
  };

  return (
    <DialogContent
      title={address ? 'Edit address' : 'Add an address'}
      description="Couriers call this number if they cannot find you."
      size="lg"
      footer={
        <>
          <DialogClose asChild>
            <Button type="button" variant="ghost" size="sm" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" form={formId} size="sm" loading={pending}>
            {address ? 'Save changes' : 'Save address'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="space-y-4">
        <Segmented label="Save as" value={kind} onChange={setKind} options={LABELS} />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Full name"
            name="fullName"
            autoComplete="name"
            required
            maxLength={80}
            defaultValue={address?.fullName ?? defaultName ?? ''}
            error={errors.fullName}
          />
          <Input
            label="Mobile number"
            name="phone"
            type="tel"
            inputMode="numeric"
            autoComplete="tel-national"
            required
            maxLength={14}
            defaultValue={address?.phone ?? defaultPhone ?? ''}
            hint="10 digits, for the courier."
            error={errors.phone}
          />
        </div>

        <Input
          label="House, building and street"
          name="line1"
          autoComplete="address-line1"
          required
          maxLength={160}
          defaultValue={address?.line1 ?? ''}
          error={errors.line1}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Area or locality"
            name="line2"
            autoComplete="address-line2"
            maxLength={160}
            defaultValue={address?.line2 ?? ''}
            error={errors.line2}
          />
          <Input
            label="Landmark"
            name="landmark"
            maxLength={120}
            defaultValue={address?.landmark ?? ''}
            hint="Optional. Opposite the school, near the metro."
            error={errors.landmark}
          />
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            label="Pincode"
            name="pincode"
            inputMode="numeric"
            autoComplete="postal-code"
            required
            maxLength={6}
            defaultValue={address?.pincode ?? ''}
            error={errors.pincode}
          />
          <Input
            label="City"
            name="city"
            autoComplete="address-level2"
            required
            maxLength={80}
            defaultValue={address?.city ?? ''}
            error={errors.city}
          />
          <Select
            label="State"
            name="state"
            autoComplete="address-level1"
            required
            defaultValue={address?.state ?? ''}
            error={errors.state}
          >
            <option value="" disabled>
              Choose
            </option>
            {INDIAN_STATES.map((state) => (
              <option key={state} value={state}>
                {state}
              </option>
            ))}
          </Select>
        </div>

        <Input
          label="Alternate number"
          name="alternatePhone"
          type="tel"
          inputMode="numeric"
          maxLength={14}
          defaultValue={address?.alternatePhone ?? ''}
          hint="Optional."
          error={errors.alternatePhone}
        />

        {address?.isDefault ? (
          <p className="text-muted text-xs">
            This is your default address. Make another one the default to change it.
          </p>
        ) : (
          <Switch
            name="isDefault"
            label="Make this my default address"
            description="Checkout picks it first."
          />
        )}
      </form>
    </DialogContent>
  );
}

/** Edit, make default and remove, for one card in the address book. */
export function AddressCardActions({ address }: { address: Address }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  const makeDefault = () =>
    startTransition(async () => {
      const result = await setDefaultAddress(address.id);
      if (result.ok) toast.success('Default address updated');
      else toast.error(result.error ?? 'That did not work.');
    });

  const remove = () =>
    startTransition(async () => {
      const result = await deleteAddress(address.id);
      if (result.ok) {
        setConfirming(false);
        toast.success('Address removed');
      } else {
        toast.error(result.error ?? 'That did not work.');
      }
    });

  return (
    <div className="border-line mt-4 flex flex-wrap items-center gap-1 border-t pt-3">
      <AddressFormDialog address={address} />

      {address.isDefault ? null : (
        <Button size="xs" variant="ghost" disabled={pending} onClick={makeDefault}>
          <Star className="size-3.5" aria-hidden />
          Make default
        </Button>
      )}

      <Dialog open={confirming} onOpenChange={setConfirming}>
        <DialogTrigger asChild>
          <Button size="xs" variant="ghost" className="text-danger-600 hover:text-danger-700 ml-auto">
            <Trash2 className="size-3.5" aria-hidden />
            Remove
          </Button>
        </DialogTrigger>
        <DialogContent
          size="sm"
          title="Remove this address?"
          description="Orders already placed keep the address they were sent to."
          footer={
            <>
              <DialogClose asChild>
                <Button variant="ghost" size="sm">
                  Keep it
                </Button>
              </DialogClose>
              <Button variant="danger" size="sm" loading={pending} onClick={remove}>
                Remove
              </Button>
            </>
          }
        >
          <p className="text-muted text-sm">
            {address.fullName}, {address.line1}, {address.city} {address.pincode}
          </p>
        </DialogContent>
      </Dialog>
    </div>
  );
}