'use client';

import { Check, Save, Shuffle, Tag } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useSyncExternalStore, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/choice';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  AUDIENCE_LABEL,
  COUPON_SCOPE_LABEL,
  couponHeadline,
  couponTerms,
  describeCoupon,
  exampleSaving,
  suggestCode,
  type CouponRuleInput,
} from '@/domain/coupon-rules';
import { PAYMENT_METHOD_LABEL, PAYMENT_METHODS, type PaymentMethod } from '@/domain/enums';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/format';
import { saveCoupon, type CouponInput } from '@/server/actions/coupons';
import type { CouponTargets } from '@/server/services/coupons-admin';

import { TargetPicker } from './target-picker';

const RUPEE = '₹';

/** The form's own state: numbers as the strings being typed. */
export interface CouponDraft {
  code: string;
  title: string;
  description: string;
  type: CouponInput['type'];
  value: string;
  maxDiscount: string;
  minCartValue: string;
  audience: CouponInput['audience'];
  scope: CouponInput['scope'];
  targets: string[];
  paymentMethods: PaymentMethod[];
  totalUsageLimit: string;
  perUserLimit: string;
  /** ISO. Shown in the viewer's own time zone once mounted. */
  startsAt: string;
  endsAt: string;
  visible: boolean;
  stackableWithOffers: boolean;
  fundedBy: CouponInput['fundedBy'];
}

type Errors = Partial<Record<string, string>>;

const noop = () => () => {};
/** True in the browser after hydration; false while server-rendering. */
function useMounted() {
  return useSyncExternalStore(noop, () => true, () => false);
}

function toLocalInput(iso: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function fromLocalInput(local: string): string {
  return local ? new Date(local).toISOString() : '';
}

const rupees = (value: string) => (value.trim() === '' ? null : Number(value));

/**
 * One coupon, created or edited on its own page.
 *
 * The right-hand column is the point of the screen: the coupon exactly as a
 * shopper meets it in the bag, the rules in one plain sentence, the small
 * print the bag will show, and what an example bag would save -- all written
 * from the same rules the form is editing, so what is previewed is what ships.
 */
export function CouponEditor({
  id,
  initial,
  targets,
  usedCount,
}: {
  id: string | null;
  initial: CouponDraft;
  targets: CouponTargets;
  usedCount: number;
}) {
  const router = useRouter();
  const mounted = useMounted();
  const [form, setForm] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [errors, setErrors] = useState<Errors>({});
  const [exampleCart, setExampleCart] = useState('2000');
  const [pending, startTransition] = useTransition();

  const dirty = JSON.stringify(form) !== JSON.stringify(saved);
  const codeLocked = usedCount > 0;

  const set = <K extends keyof CouponDraft>(key: K, value: CouponDraft[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: undefined }));
  };

  useEffect(() => {
    const onLeave = (event: BeforeUnloadEvent) => {
      if (dirty) event.preventDefault();
    };
    window.addEventListener('beforeunload', onLeave);
    return () => window.removeEventListener('beforeunload', onLeave);
  }, [dirty]);

  /* ------------------------------------------------------------ preview */

  const targetOptions =
    form.scope === 'CATEGORY' ? targets.categories : form.scope === 'BRAND' ? targets.brands : targets.sellers;

  const rule: CouponRuleInput = useMemo(() => {
    const value = Number(form.value) || 0;
    return {
      type: form.type,
      value: form.type === 'FIXED' ? Math.round(value * 100) : value,
      maxDiscount: form.type === 'PERCENTAGE' && rupees(form.maxDiscount) ? Math.round(Number(form.maxDiscount) * 100) : null,
      minCartValue: Math.round((Number(form.minCartValue) || 0) * 100),
      audience: form.audience,
      scope: form.scope,
      targetNames: form.scope === 'PLATFORM'
        ? []
        : form.targets.map((key) => targetOptions.find((option) => option.value === key)?.label.replace(/^(— )+/, '') ?? key),
      paymentMethods: form.paymentMethods,
      totalUsageLimit: rupees(form.totalUsageLimit),
      perUserLimit: Number(form.perUserLimit) || 1,
    };
  }, [form, targetOptions]);

  const example = Math.round((Number(exampleCart) || 0) * 100);
  const saving = exampleSaving(rule, example);

  /* --------------------------------------------------------------- save */

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const input: CouponInput = {
      id,
      code: form.code,
      title: form.title,
      description: form.description,
      type: form.type,
      value: form.type === 'FREE_SHIPPING' ? 0 : Number(form.value) || 0,
      maxDiscount: form.type === 'PERCENTAGE' ? rupees(form.maxDiscount) : null,
      minCartValue: Number(form.minCartValue) || 0,
      audience: form.audience,
      scope: form.scope,
      targets: form.scope === 'PLATFORM' ? [] : form.targets,
      paymentMethods: form.paymentMethods,
      totalUsageLimit: rupees(form.totalUsageLimit),
      perUserLimit: Number(form.perUserLimit) || 1,
      startsAt: form.startsAt,
      endsAt: form.endsAt,
      visible: form.visible,
      stackableWithOffers: form.stackableWithOffers,
      fundedBy: form.fundedBy,
    };

    startTransition(async () => {
      const result = await saveCoupon(input);
      if (!result.ok) {
        if (result.field) {
          setErrors({ [result.field]: result.error });
          document.querySelector(`[data-field="${result.field}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        toast.error(result.error ?? 'That did not save.');
        return;
      }
      setSaved(form);
      toast.success(id ? 'Saved — live rules updated' : `${form.code.toUpperCase()} created`);
      if (!id && result.id) router.push(`/admin/coupons/${result.id}`);
      else router.refresh();
    });
  };

  /** Presets are computed on click, from the moment the button is pressed. */
  const preset = (days: number) => {
    const start = new Date();
    const end = new Date(start.getTime() + days * 86_400_000);
    end.setHours(23, 59, 0, 0);
    set('startsAt', start.toISOString());
    set('endsAt', end.toISOString());
  };

  const weekend = () => {
    const now = new Date();
    const saturday = new Date(now);
    saturday.setDate(now.getDate() + ((6 - now.getDay() + 7) % 7 || 7));
    saturday.setHours(0, 0, 0, 0);
    const sunday = new Date(saturday);
    sunday.setDate(saturday.getDate() + 1);
    sunday.setHours(23, 59, 0, 0);
    set('startsAt', saturday.toISOString());
    set('endsAt', sunday.toISOString());
  };

  return (
    <form onSubmit={submit} noValidate className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_26rem]">
      <div className="min-w-0 space-y-6">
        {/* ------------------------------------------------------ basics */}
        <Card title="The code" description="What shoppers type, and what the bag calls it.">
          <div className="grid gap-4 sm:grid-cols-2">
            <div data-field="code" className="flex items-end gap-2">
              <div className="min-w-0 flex-1">
                <Input
                  label="Code"
                  value={form.code}
                  onChange={(event) => set('code', event.target.value.toUpperCase().replace(/\s+/g, ''))}
                  maxLength={20}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="SUMMER20"
                  hint={codeLocked ? `Used ${usedCount} times, so it can no longer change.` : '4 to 20 letters or digits.'}
                  error={errors.code}
                  disabled={codeLocked}
                  className="font-mono uppercase"
                />
              </div>
              {!codeLocked ? (
                <Button
                  type="button"
                  variant="secondary"
                  size="icon"
                  aria-label="Suggest a code"
                  title="Suggest a code"
                  className="mb-6"
                  onClick={() => set('code', suggestCode(form.title, Math.random))}
                >
                  <Shuffle className="size-4" aria-hidden />
                </Button>
              ) : null}
            </div>
            <div data-field="title">
              <Input
                label="Title"
                value={form.title}
                onChange={(event) => set('title', event.target.value)}
                maxLength={80}
                placeholder="20% off your summer order"
                hint="What the bag’s coupon list shows."
                error={errors.title}
              />
            </div>
          </div>
          <Textarea
            label="Description (optional)"
            rows={2}
            maxLength={240}
            value={form.description}
            onChange={(event) => set('description', event.target.value)}
            placeholder="Our summer edit, on us."
          />
        </Card>

        {/* ---------------------------------------------------- discount */}
        <Card title="The discount" description="How much comes off, and when a bag qualifies.">
          <Segmented
            label="Discount type"
            value={form.type}
            onChange={(value) => set('type', value)}
            options={[
              { value: 'PERCENTAGE', label: 'Percent off' },
              { value: 'FIXED', label: 'Amount off' },
              { value: 'FREE_SHIPPING', label: 'Free delivery' },
            ]}
          />
          <div className="grid gap-4 sm:grid-cols-3">
            {form.type !== 'FREE_SHIPPING' ? (
              <div data-field="value">
                <Input
                  label={form.type === 'PERCENTAGE' ? 'Percent off' : 'Amount off'}
                  type="number"
                  inputMode="decimal"
                  min={1}
                  max={form.type === 'PERCENTAGE' ? 90 : undefined}
                  value={form.value}
                  onChange={(event) => set('value', event.target.value)}
                  leading={form.type === 'FIXED' ? RUPEE : undefined}
                  trailing={form.type === 'PERCENTAGE' ? '%' : undefined}
                  error={errors.value}
                />
              </div>
            ) : null}
            {form.type === 'PERCENTAGE' ? (
              <div data-field="maxDiscount">
                <Input
                  label="Maximum discount"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  value={form.maxDiscount}
                  onChange={(event) => set('maxDiscount', event.target.value)}
                  leading={RUPEE}
                  hint="Blank means no cap."
                  error={errors.maxDiscount}
                />
              </div>
            ) : null}
            <div data-field="minCartValue">
              <Input
                label="Minimum order"
                type="number"
                inputMode="decimal"
                min={0}
                value={form.minCartValue}
                onChange={(event) => set('minCartValue', event.target.value)}
                leading={RUPEE}
                hint="0 for any order."
                error={errors.minCartValue}
              />
            </div>
          </div>
        </Card>

        {/* ------------------------------------------------- who & where */}
        <Card title="Who and where" description="Which shoppers, which items, and which ways to pay.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Who can use it"
              value={form.audience}
              onChange={(event) => set('audience', event.target.value as CouponDraft['audience'])}
            >
              {(['ALL', 'NEW_CUSTOMER', 'EXISTING_CUSTOMER'] as const).map((audience) => (
                <option key={audience} value={audience}>
                  {AUDIENCE_LABEL[audience]}
                </option>
              ))}
            </Select>
            <Select
              label="What it applies to"
              value={form.scope}
              onChange={(event) => {
                set('scope', event.target.value as CouponDraft['scope']);
                set('targets', []);
              }}
            >
              {(['PLATFORM', 'CATEGORY', 'BRAND', 'SELLER'] as const).map((scope) => (
                <option key={scope} value={scope}>
                  {scope === 'PLATFORM' ? 'Everything in the shop' : `Chosen ${COUPON_SCOPE_LABEL[scope].toLowerCase()}`}
                </option>
              ))}
            </Select>
          </div>

          {form.scope !== 'PLATFORM' ? (
            <div data-field="targets">
              <TargetPicker
                label={COUPON_SCOPE_LABEL[form.scope]}
                options={targetOptions}
                value={form.targets}
                onChange={(value) => set('targets', value)}
                error={errors.targets}
              />
            </div>
          ) : null}

          <fieldset>
            <legend className="text-ink text-sm font-medium">Payment methods</legend>
            <p className="text-muted text-xs">None ticked means any way to pay. Tick some to make it a bank or UPI offer.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {PAYMENT_METHODS.map((method) => {
                const on = form.paymentMethods.includes(method);
                return (
                  <button
                    key={method}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() =>
                      set('paymentMethods', on ? form.paymentMethods.filter((item) => item !== method) : [...form.paymentMethods, method])
                    }
                    className={cn(
                      'inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors',
                      on ? 'border-ink bg-ink text-canvas' : 'border-line-control bg-raised text-muted hover:text-ink',
                    )}
                  >
                    {on ? <Check className="size-3.5" aria-hidden /> : null}
                    {PAYMENT_METHOD_LABEL[method]}
                  </button>
                );
              })}
            </div>
          </fieldset>
        </Card>

        {/* ------------------------------------------------ limits, dates */}
        <Card title="Limits and dates" description="How often it can be used, and when it works.">
          <div className="grid gap-4 sm:grid-cols-2">
            <div data-field="totalUsageLimit">
              <Input
                label="Total uses"
                type="number"
                inputMode="numeric"
                min={1}
                value={form.totalUsageLimit}
                onChange={(event) => set('totalUsageLimit', event.target.value)}
                hint={usedCount ? `Used ${usedCount} so far. Blank means unlimited.` : 'Blank means unlimited.'}
                error={errors.totalUsageLimit}
              />
            </div>
            <div data-field="perUserLimit">
              <Input
                label="Uses per customer"
                type="number"
                inputMode="numeric"
                min={1}
                max={100}
                value={form.perUserLimit}
                onChange={(event) => set('perUserLimit', event.target.value)}
                error={errors.perUserLimit}
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-muted mr-1 text-xs">Quick dates:</span>
            {[
              { label: 'Next 7 days', run: () => preset(7) },
              { label: 'Next 30 days', run: () => preset(30) },
              { label: 'This weekend', run: weekend },
            ].map((item) => (
              <Button key={item.label} type="button" size="xs" variant="secondary" onClick={item.run}>
                {item.label}
              </Button>
            ))}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div data-field="startsAt">
              <Input
                label="Starts"
                type="datetime-local"
                value={mounted ? toLocalInput(form.startsAt) : ''}
                disabled={!mounted}
                onChange={(event) => set('startsAt', fromLocalInput(event.target.value))}
                error={errors.startsAt}
              />
            </div>
            <div data-field="endsAt">
              <Input
                label="Ends"
                type="datetime-local"
                value={mounted ? toLocalInput(form.endsAt) : ''}
                disabled={!mounted}
                onChange={(event) => set('endsAt', fromLocalInput(event.target.value))}
                error={errors.endsAt}
              />
            </div>
          </div>
        </Card>

        {/* -------------------------------------------------- visibility */}
        <Card title="Visibility and funding" description="Where it shows, whether it stacks, and who pays for it.">
          <div className="divide-line divide-y">
            <Switch
              label="Show in the bag’s coupon list"
              description="Off makes it a code-only coupon: it works when typed, but is never suggested."
              checked={form.visible}
              onChange={(event) => set('visible', event.target.checked)}
            />
            <Switch
              label="Combine with automatic offers"
              description="Lets it apply on top of promotions already discounting the bag. Coupons never combine with each other."
              checked={form.stackableWithOffers}
              onChange={(event) => set('stackableWithOffers', event.target.checked)}
            />
          </div>
          <Segmented
            label="Funded by"
            value={form.fundedBy}
            onChange={(value) => set('fundedBy', value)}
            options={[
              { value: 'PLATFORM', label: 'VestraWAB' },
              { value: 'SELLER', label: 'The seller' },
            ]}
            size="sm"
          />
        </Card>
      </div>

      {/* ------------------------------------------------------ preview */}
      <aside className="min-w-0 space-y-4 lg:sticky lg:top-20 lg:self-start">
        <section className="border-line bg-raised rounded-lg border p-4" aria-label="How shoppers see it">
          <p className="text-faint text-2xs font-semibold uppercase tracking-wider">In the bag</p>
          <div className="border-line bg-canvas mt-3 rounded-md border p-3">
            <p className="text-ink flex items-center gap-2 text-sm font-semibold">
              <Tag className="text-accent-ink size-4" aria-hidden />
              Coupons
            </p>
            <div className="border-line mt-3 flex items-start justify-between gap-3 rounded-md border p-2.5">
              <div className="min-w-0">
                <p className="text-ink font-mono text-xs font-semibold">{form.code || 'CODE'}</p>
                <p className="text-muted mt-0.5 text-xs">{form.title || couponHeadline(rule, formatMoney)}</p>
                {rule.minCartValue > 0 && saving === null ? (
                  <p className="text-faint mt-0.5 text-2xs">
                    Add {formatMoney(Math.max(0, rule.minCartValue - example))} more to use this
                  </p>
                ) : null}
              </div>
              {saving !== null ? (
                <span className="text-accent shrink-0 text-xs font-medium">Save {formatMoney(saving)}</span>
              ) : (
                <span className="text-faint shrink-0 text-2xs">{form.type === 'FREE_SHIPPING' ? 'Free delivery' : 'Not yet'}</span>
              )}
            </div>
            {!form.visible ? (
              <p className="text-faint mt-2 text-2xs">Not listed here — it works only when typed.</p>
            ) : null}
          </div>
          <label className="text-muted mt-3 flex items-center gap-2 text-xs">
            Example bag
            <span className="border-line-control bg-canvas inline-flex items-center rounded-sm border px-2">
              {RUPEE}
              <input
                type="number"
                min={0}
                value={exampleCart}
                onChange={(event) => setExampleCart(event.target.value)}
                className="text-ink h-7 w-20 bg-transparent pl-1 text-xs outline-none"
              />
            </span>
          </label>
        </section>

        <section className="border-line bg-raised rounded-lg border p-4" aria-label="In plain words">
          <p className="text-faint text-2xs font-semibold uppercase tracking-wider">In plain words</p>
          <p className="text-ink mt-2 text-sm leading-relaxed">{describeCoupon(rule, formatMoney)}</p>
          <p className="text-faint mt-3 text-2xs font-semibold uppercase tracking-wider">Small print shoppers see</p>
          <ul className="text-muted mt-1.5 list-disc space-y-1 pl-4 text-xs">
            {couponTerms(rule, formatMoney).map((term) => (
              <li key={term}>{term}</li>
            ))}
          </ul>
        </section>

        <div className="border-line bg-raised sticky bottom-3 flex items-center justify-between gap-3 rounded-lg border p-3 shadow-sm">
          <span className="text-xs" role="status">
            {dirty ? <span className="text-warning-700 font-medium">Unsaved changes</span> : <span className="text-muted">All changes saved</span>}
          </span>
          <Button type="submit" disabled={pending || (!dirty && Boolean(id))}>
            <Save className="size-4" aria-hidden />
            {pending ? 'Saving…' : id ? 'Save changes' : 'Create coupon'}
          </Button>
        </div>
      </aside>
    </form>
  );
}

function Card({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="border-line bg-raised rounded-lg border" aria-label={title}>
      <header className="border-line border-b px-4 py-3 sm:px-5">
        <h2 className="text-ink text-sm font-semibold">{title}</h2>
        <p className="text-muted mt-0.5 text-xs">{description}</p>
      </header>
      <div className="space-y-4 p-4 sm:p-5">{children}</div>
    </section>
  );
}
