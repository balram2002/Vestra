'use client';

import { Plus } from 'lucide-react';
import { useId, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/choice';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  createBrand,
  createCategory,
  createPromotion,
  type CreateBrandInput,
  type CreateCategoryInput,
  type CreatePromotionInput,
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

const RUPEE = '\u20B9';

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

/** A LOCAL calendar date for a date input. UTC would roll the day over at 5:30am in India. */
function localDate(offsetDays: number): string {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

const startOfDay = (value: string) => (value ? new Date(`${value}T00:00:00`).toISOString() : '');
const endOfDay = (value: string) => (value ? new Date(`${value}T23:59:59`).toISOString() : '');

function text(form: FormData, key: string): string {
  return String(form.get(key) ?? '').trim();
}

/** A number field; blank is null, which the actions read as no limit. */
function num(form: FormData, key: string): number | null {
  const value = text(form, key);
  return value === '' ? null : Number(value);
}

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

function Legend({ children }: { children: React.ReactNode }) {
  return <legend className="text-ink mb-3 text-sm font-semibold">{children}</legend>;
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
/* --------------------------------------------------------------- promotion */

type ValueKind = CreatePromotionInput['valueKind'];

/*
 * SALE is not a stored type: it resolves to PERCENT_DISCOUNT or FLAT_DISCOUNT
 * from the value kind, so the form never offers a "flat discount" that takes
 * a percentage off.
 */
type Campaign = 'SALE' | 'FLASH_SALE' | 'CATEGORY_OFFER' | 'FESTIVAL_CAMPAIGN';

const CAMPAIGNS: ReadonlyArray<{ value: Campaign; label: string }> = [
  { value: 'SALE', label: 'Sale' },
  { value: 'FLASH_SALE', label: 'Flash sale (limited units)' },
  { value: 'CATEGORY_OFFER', label: 'Category offer' },
  { value: 'FESTIVAL_CAMPAIGN', label: 'Festival campaign' },
];

const VALUE_KINDS: ReadonlyArray<{ value: ValueKind; label: string }> = [
  { value: 'PERCENT', label: 'Percent off' },
  { value: 'AMOUNT', label: 'Amount off' },
];

export interface PromotionCategoryOption {
  id: string;
  label: string;
}

export function CreatePromotionDialog({ categories }: { categories: PromotionCategoryOption[] }) {
  const { open, onOpenChange, session, close } = useFreshDialog();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-3.5" aria-hidden />
          New promotion
        </Button>
      </DialogTrigger>
      <PromotionForm
        key={session.key}
        start={session.start}
        end={session.end}
        categories={categories}
        onDone={close}
      />
    </Dialog>
  );
}

function PromotionForm({
  start,
  end,
  categories,
  onDone,
}: {
  start: string;
  end: string;
  categories: PromotionCategoryOption[];
  onDone: () => void;
}) {
  const formId = useId();
  const [campaign, setCampaign] = useState<Campaign>('SALE');
  const [valueKind, setValueKind] = useState<ValueKind>('PERCENT');
  const [errors, setErrors] = useState<FieldErrors>({});
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const categoryId = text(form, 'categoryId');

    const input: CreatePromotionInput = {
      title: text(form, 'title'),
      description: text(form, 'description'),
      badgeText: text(form, 'badgeText'),
      type:
        campaign === 'SALE'
          ? valueKind === 'PERCENT'
            ? 'PERCENT_DISCOUNT'
            : 'FLAT_DISCOUNT'
          : campaign,
      valueKind,
      value: num(form, 'value') ?? 0,
      maxDiscount: valueKind === 'PERCENT' ? num(form, 'maxDiscount') : null,
      minOrderValue: num(form, 'minOrderValue') ?? 0,
      categoryId: categoryId === '' ? null : categoryId,
      priority: num(form, 'priority') ?? 0,
      stockLimit: campaign === 'FLASH_SALE' ? num(form, 'stockLimit') : null,
      startsAt: startOfDay(text(form, 'startsAt')),
      endsAt: endOfDay(text(form, 'endsAt')),
    };

    setErrors({});
    startTransition(async () => {
      const result = await createPromotion(input);
      if (result.ok) {
        toast.success(`${input.title} saved, paused`, {
          description: 'Check it in the table, then switch it on.',
        });
        onDone();
      } else if (result.field) {
        setErrors({ [result.field]: result.error });
      } else {
        toast.error(result.error ?? 'Could not create the promotion.');
      }
    });
  };

  return (
    <DialogContent
      title="New promotion"
      description="Applies on its own, with no code. It is saved paused so you can check it before it reprices the shop."
      size="lg"
      footer={<Footer formId={formId} pending={pending} label="Save paused" />}
    >
      <form id={formId} onSubmit={submit} noValidate className="space-y-6">
        <fieldset>
          <Legend>The offer</Legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Title"
              name="title"
              required
              maxLength={80}
              placeholder="End of season sale"
              error={errors.title}
            />
            <Input
              label="Badge"
              name="badgeText"
              maxLength={24}
              placeholder="Flash sale"
              hint="Optional. The chip on product cards."
              error={errors.badgeText}
            />
          </div>
          <Textarea
            className="mt-4"
            label="Description"
            name="description"
            rows={2}
            maxLength={240}
            required
            placeholder="Up to 40% off summer styles."
            error={errors.description}
          />
        </fieldset>

        <fieldset>
          <Legend>Discount</Legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Campaign"
              value={campaign}
              onChange={(event) => setCampaign(event.target.value as Campaign)}
            >
              {CAMPAIGNS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
            <Select
              label="Applies to"
              name="categoryId"
              defaultValue=""
              error={errors.categoryId}
              hint={campaign === 'CATEGORY_OFFER' ? 'Pick the category it covers.' : undefined}
            >
              <option value="">Everything in the shop</option>
              {categories.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>

          <Segmented
            className="mt-4"
            label="Discount kind"
            value={valueKind}
            onChange={setValueKind}
            options={VALUE_KINDS}
          />

          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            <Input
              key={valueKind}
              label={valueKind === 'PERCENT' ? 'Percent off' : 'Amount off each item'}
              name="value"
              type="number"
              inputMode="decimal"
              min={1}
              max={valueKind === 'PERCENT' ? 80 : undefined}
              step={1}
              required
              leading={valueKind === 'AMOUNT' ? RUPEE : undefined}
              trailing={valueKind === 'PERCENT' ? '%' : undefined}
              error={errors.value}
            />
            {valueKind === 'PERCENT' ? (
              <Input
                label="Maximum discount"
                name="maxDiscount"
                type="number"
                inputMode="decimal"
                min={0}
                step={1}
                leading={RUPEE}
                hint="Blank means no cap."
                error={errors.maxDiscount}
              />
            ) : null}
            <Input
              label="Minimum order value"
              name="minOrderValue"
              type="number"
              inputMode="decimal"
              min={0}
              step={1}
              defaultValue={0}
              leading={RUPEE}
              error={errors.minOrderValue}
            />
          </div>
        </fieldset>

        <fieldset>
          <Legend>Schedule</Legend>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Starts"
              name="startsAt"
              type="date"
              defaultValue={start}
              required
              error={errors.startsAt}
            />
            <Input
              label="Ends"
              name="endsAt"
              type="date"
              defaultValue={end}
              required
              error={errors.endsAt}
            />
            <Input
              label="Priority"
              name="priority"
              type="number"
              inputMode="numeric"
              min={0}
              max={100}
              step={1}
              defaultValue={10}
              hint="Only the best offer applies to an item; priority breaks a tie."
              error={errors.priority}
            />
            {campaign === 'FLASH_SALE' ? (
              <Input
                label="Units at this price"
                name="stockLimit"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                hint="Blank means unlimited."
                error={errors.stockLimit}
              />
            ) : null}
          </div>
        </fieldset>
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
