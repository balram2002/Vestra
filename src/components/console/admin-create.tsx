'use client';

import { Plus } from 'lucide-react';
import { useId, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/choice';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  createBrand,
  createCategory,
  type CreateBrandInput,
  type CreateCategoryInput,
} from '@/server/actions/admin';

/**
 * Admin create flows: coupons, categories, promotions.
 *
 * Each is a trigger button for the page header and a dialog whose form is
 * REMOUNTED on every open (a new key), so a second coupon never starts with the
 * first one's code, dates or errors. Fields are uncontrolled and read from
 * FormData on submit; only the values that change the shape of the form (the
 * discount type, the parent category) are state.
 *
 * The server action is the validator. It answers with the field an error
 * belongs to, and the form shows it under that input rather than as a toast
 * that has gone before anyone reads which box was wrong.
 */

type FieldErrors = Partial<Record<string, string>>;


function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** A LOCAL calendar date for a date input. UTC would roll the day over at 5:30am in India. */
function localDate(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}


function text(form: FormData, key: string): string {
  return String(form.get(key) ?? '').trim();
}

/** A number field; blank is null, which the actions read as no limit. */

/** Opens fresh every time: a new key and today's dates. */
function useFreshDialog() {
  const [open, setOpen] = useState(false);
  const [session, setSession] = useState({ key: 0, start: '', end: '' });

  const onOpenChange = (next: boolean) => {
    // Dates are read HERE, in an event, not during render, so the form shows
    // the day the dialog was opened rather than the day the page was built.
    if (next) setSession((s) => ({ key: s.key + 1, start: localDate(0), end: localDate(30) }));
    setOpen(next);
  };

  return { open, onOpenChange, session, close: () => setOpen(false) };
}


function Footer({ formId, pending, label }: { formId: string; pending: boolean; label: string }) {
  return (
    <>
      <DialogClose asChild>
        <Button type="button" variant="ghost" size="sm" disabled={pending}>
          Cancel
        </Button>
      </DialogClose>
      <Button type="submit" form={formId} size="sm" loading={pending}>
        {label}
      </Button>
    </>
  );
}

/* ---------------------------------------------------------------- category */

export interface CategoryParentOption {
  id: string;
  /** The full path, for example Women / Ethnic wear. */
  label: string;
  taxRatePercent: number;
  returnable: boolean;
}

export function CreateCategoryDialog({ parents }: { parents: CategoryParentOption[] }) {
  const { open, onOpenChange, session, close } = useFreshDialog();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-3.5" aria-hidden />
          New category
        </Button>
      </DialogTrigger>
      <CategoryForm key={session.key} parents={parents} onDone={close} />
    </Dialog>
  );
}

function CategoryForm({
  parents,
  onDone,
}: {
  parents: CategoryParentOption[];
  onDone: () => void;
}) {
  const formId = useId();
  const [parentId, setParentId] = useState(parents[0]?.id ?? '');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, startTransition] = useTransition();

  const parent = parents.find((option) => option.id === parentId);

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const tax = text(form, 'taxRatePercent');
    const returns = text(form, 'returnable');

    const input: CreateCategoryInput = {
      parentId,
      name: text(form, 'name'),
      description: text(form, 'description'),
      taxRatePercent: tax === '' ? null : Number(tax),
      returnable: returns === '' ? null : returns === 'yes',
      featured: form.get('featured') === 'on',
    };

    setErrors({});
    startTransition(async () => {
      const result = await createCategory(input);
      if (result.ok) {
        toast.success(`${input.name} added under ${parent?.label ?? 'its parent'}`);
        onDone();
      } else if (result.field) {
        setErrors({ [result.field]: result.error });
      } else {
        toast.error(result.error ?? 'Could not create the category.');
      }
    });
  };

  return (
    <DialogContent
      title="New category"
      description="It inherits its facets, size system and imagery from the category it sits under."
      footer={<Footer formId={formId} pending={pending} label="Create category" />}
    >
      <form id={formId} onSubmit={submit} noValidate className="space-y-4">
        <Select
          label="Sits under"
          value={parentId}
          onChange={(event) => setParentId(event.target.value)}
          error={errors.parentId}
        >
          {parents.map((option) => (
            <option key={option.id} value={option.id}>
              {option.label}
            </option>
          ))}
        </Select>

        <Input
          label="Name"
          name="name"
          required
          maxLength={60}
          placeholder="Co-ord sets"
          error={errors.name}
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <Select
            key={`tax-${parentId}`}
            label="GST slab"
            name="taxRatePercent"
            defaultValue=""
            error={errors.taxRatePercent}
          >
            <option value="">Same as parent{parent ? ` (${parent.taxRatePercent}%)` : ''}</option>
            {[0, 5, 12, 18, 28].map((rate) => (
              <option key={rate} value={rate}>
                {rate}%
              </option>
            ))}
          </Select>
          <Select key={`ret-${parentId}`} label="Returns" name="returnable" defaultValue="">
            <option value="">
              Same as parent{parent ? ` (${parent.returnable ? 'returnable' : 'final sale'})` : ''}
            </option>
            <option value="yes">Returnable</option>
            <option value="no">Final sale</option>
          </Select>
        </div>

        <Textarea
          label="Description"
          name="description"
          rows={3}
          maxLength={300}
          hint="Optional. Shown on the category page and to search engines."
          error={errors.description}
        />

        <Switch
          name="featured"
          label="Feature in the menu"
          description="Shown in the mega menu even before it has products of its own."
        />
      </form>
    </DialogContent>
  );
}
/* ------------------------------------------------------------------- brand */

export function CreateBrandDialog() {
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
        <Button size="sm">
          <Plus className="size-3.5" aria-hidden />
          New brand
        </Button>
      </DialogTrigger>
      <BrandForm key={key} onDone={() => setOpen(false)} />
    </Dialog>
  );
}

function BrandForm({ onDone }: { onDone: () => void }) {
  const formId = useId();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const year = text(form, 'foundedYear');

    const input: CreateBrandInput = {
      name: text(form, 'name'),
      code: text(form, 'code').toUpperCase(),
      description: text(form, 'description'),
      originCountry: text(form, 'originCountry'),
      foundedYear: year === '' ? null : Number(year),
      logoUrl: text(form, 'logoUrl'),
      isPremium: form.get('isPremium') === 'on',
    };

    setErrors({});
    startTransition(async () => {
      const result = await createBrand(input);
      if (result.ok) {
        toast.success(`${input.name} added`, { description: 'Sellers can choose it on their listings now.' });
        onDone();
      } else if (result.field) {
        setErrors({ [result.field]: result.error });
      } else {
        toast.error(result.error ?? 'Could not add the brand.');
      }
    });
  };

  return (
    <DialogContent
      title="New brand"
      description="Sellers choose from these on every listing, and a listing cannot be submitted without one."
      footer={<Footer formId={formId} pending={pending} label="Add brand" />}
    >
      <form id={formId} onSubmit={submit} noValidate className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_8rem]">
          <Input label="Name" name="name" required maxLength={60} placeholder="Label name" error={errors.name} />
          <Input
            label="Code"
            name="code"
            maxLength={6}
            autoCapitalize="characters"
            spellCheck={false}
            placeholder="AUTO"
            hint="Used in SKUs."
            error={errors.code}
            className="font-mono uppercase"
          />
        </div>
        <Textarea
          label="Description"
          name="description"
          rows={3}
          maxLength={400}
          hint="Optional. Shown on the brand page."
          error={errors.description}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label="Country of origin" name="originCountry" defaultValue="India" maxLength={40} error={errors.originCountry} />
          <Input
            label="Founded"
            name="foundedYear"
            type="number"
            inputMode="numeric"
            min={1800}
            max={2100}
            step={1}
            hint="Optional."
            error={errors.foundedYear}
          />
        </div>
        <Input
          label="Logo link"
          name="logoUrl"
          type="url"
          inputMode="url"
          placeholder="https://"
          hint="Optional. Without one, the brand gets a monogram."
          error={errors.logoUrl}
        />
        <Switch name="isPremium" label="Premium label" description="Marks the brand as premium." />
      </form>
    </DialogContent>
  );
}
