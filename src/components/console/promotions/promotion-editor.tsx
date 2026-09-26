'use client';

import { AlertTriangle, Check, Save } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, useSyncExternalStore, useTransition } from 'react';
import { toast } from 'sonner';

import { TargetPicker } from '@/components/console/coupons/target-picker';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Segmented } from '@/components/ui/segmented';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  PAYMENT_METHOD_LABEL,
  PAYMENT_METHODS,
  type PaymentMethod,
  type PromotionType,
  type PromotionValueKind,
} from '@/domain/enums';
import {
  describePromotion,
  findOverlap,
  PROMOTION_TYPE_LABEL,
  type OverlapCandidate,
  type PromotionRuleInput,
} from '@/domain/promotion-rules';
import type { Promotion } from '@/domain/types';
import { cn } from '@/lib/cn';
import { formatMoney } from '@/lib/format';
import { evaluatePromotions } from '@/lib/promotions/evaluate';
import { savePromotion, type PromotionInput } from '@/server/actions/promotions';
import type { CouponTargets } from '@/server/services/coupons-admin';
import type { PromotionPeer } from '@/server/services/promotions-admin';

const RUPEE = '₹';

export interface PromotionDraft {
  title: string;
  description: string;
  badgeText: string;
  type: PromotionInput['type'];
  valueKind: PromotionValueKind;
  value: string;
  maxDiscount: string;
  minOrderValue: string;
  buyQuantity: string;
  getQuantity: string;
  bxgyPercent: string;
  applyTo: 'CHEAPEST' | 'MOST_EXPENSIVE';
  categoryIds: string[];
  brandIds: string[];
  sellerIds: string[];
  paymentMethods: PaymentMethod[];
  bankName: string;
  priority: string;
  stockLimit: string;
  fundedBy: 'PLATFORM' | 'SELLER';
  startsAt: string;
  endsAt: string;
}

const TYPE_HINT: Record<PromotionInput['type'], string> = {
  PERCENT_DISCOUNT: 'A percentage off, shop-wide or on what you pick.',
  FLAT_DISCOUNT: 'A fixed amount off when the matching items reach a minimum.',
  FLASH_SALE: 'A short, loud sale — optionally capped at a number of units.',
  CATEGORY_OFFER: 'An offer on one or more categories.',
  FESTIVAL_CAMPAIGN: 'A named seasonal campaign; percent or amount.',
  BANK_OFFER: 'Applies only when paying with the chosen bank’s cards or UPI.',
  SELLER_OFFER: 'An offer on one or more stores, usually funded by them.',
  BUY_X_GET_Y: 'Buy some, get some free or cheaper — the cheapest by default.',
};

/** The kind the type fixes, if it fixes one. */
const FIXED_KIND: Partial<Record<PromotionType, PromotionValueKind>> = {
  PERCENT_DISCOUNT: 'PERCENT',
  FLAT_DISCOUNT: 'AMOUNT',
};

const noop = () => () => {};
function useMounted() {
  return useSyncExternalStore(noop, () => true, () => false);
}
function toLocalInput(iso: string): string {
  if (!iso) return '';
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
const fromLocalInput = (local: string) => (local ? new Date(local).toISOString() : '');
const numberOr = (value: string, fallback: number) => (value.trim() === '' || Number.isNaN(Number(value)) ? fallback : Number(value));

/** A fixed moment inside a fixed window, so the preview never reads the clock. */
const PREVIEW_NOW = new Date('2000-01-02T00:00:00.000Z');

/**
 * One automatic offer, created or edited on its own page.
 *
 * The preview runs the REAL evaluator -- the same function checkout calls --
 * on an example bag, so what it says an item saves is what it will save. The
 * overlap panel checks the draft against every other promotion still in play,
 * live as you type, and says which one a shopper would get.
 */
export function PromotionEditor({
  id,
  initial,
  targets,
  peers,
  isLive,
}: {
  id: string | null;
  initial: PromotionDraft;
  targets: CouponTargets;
  peers: PromotionPeer[];
  isLive: boolean;
}) {
  const router = useRouter();
  const mounted = useMounted();
  const [form, setForm] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  const [price, setPrice] = useState('1999');
  const [pending, startTransition] = useTransition();
  const dirty = JSON.stringify(form) !== JSON.stringify(saved);

  const set = <K extends keyof PromotionDraft>(key: K, value: PromotionDraft[K]) => {
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

  const bxgy = form.type === 'BUY_X_GET_Y';
  const kind = FIXED_KIND[form.type] ?? form.valueKind;

  const names = useMemo(() => {
    const map = new Map(
      [...targets.categories, ...targets.brands, ...targets.sellers].map((option) => [option.value, option.label.replace(/^(— )+/, '')]),
    );
    return (value: string) => map.get(value) ?? value;
  }, [targets]);

  /* ----------------------------------------------------- derived rules */

  const valuePaiseOrPercent = kind === 'PERCENT' ? numberOr(form.value, 0) : Math.round(numberOr(form.value, 0) * 100);
  const buyXGetY = bxgy
    ? {
        buyQuantity: numberOr(form.buyQuantity, 1),
        getQuantity: numberOr(form.getQuantity, 1),
        discountPercent: numberOr(form.bxgyPercent, 100),
        applyTo: form.applyTo,
      }
    : null;

  const rule: PromotionRuleInput = {
    type: form.type,
    valueKind: kind,
    value: valuePaiseOrPercent,
    maxDiscount: kind === 'PERCENT' && form.maxDiscount ? Math.round(numberOr(form.maxDiscount, 0) * 100) : null,
    minOrderValue: Math.round(numberOr(form.minOrderValue, 0) * 100),
    buyXGetY,
    paymentMethods: form.paymentMethods,
    bankName: form.bankName || null,
    targetNames: [...form.categoryIds, ...form.brandIds, ...form.sellerIds].map(names),
    stockLimit: form.type === 'FLASH_SALE' && form.stockLimit ? numberOr(form.stockLimit, 0) : null,
  };

  /* ------------------------------------------------------------ preview */

  const unit = Math.round(numberOr(price, 0) * 100);
  const quantity = bxgy ? (buyXGetY!.buyQuantity + buyXGetY!.getQuantity) : 1;
  const preview = useMemo(() => {
    const promotion: Promotion = {
      id: 'preview',
      slug: 'preview',
      title: form.title || 'Preview',
      subtitle: null,
      description: form.description,
      type: form.type,
      valueKind: kind,
      value: valuePaiseOrPercent,
      maxDiscount: rule.maxDiscount,
      minOrderValue: rule.minOrderValue,
      // The example item is assumed to be in scope, and paid for the right way.
      categoryIds: [],
      brandIds: [],
      sellerIds: [],
      productIds: [],
      paymentMethods: [],
      bankName: null,
      startsAt: '2000-01-01T00:00:00.000Z',
      endsAt: '2100-01-01T00:00:00.000Z',
      isActive: true,
      priority: 0,
      fundedBy: form.fundedBy,
      bannerUrl: null,
      badgeText: form.badgeText || null,
      buyXGetY,
      stockLimit: null,
      stockSold: 0,
      createdAt: '',
      updatedAt: '',
    };
    const result = evaluatePromotions([promotion], {
      lines: [
        {
          refId: 'line',
          productId: 'product',
          sellerId: 'seller',
          brandId: 'brand',
          categoryPath: [],
          quantity,
          unitSellingPrice: unit,
          lineSubtotal: unit * quantity,
        },
      ],
      paymentMethod: null,
      now: PREVIEW_NOW,
    });
    return result.offers[0]?.discount ?? 0;
    // `rule` fields used here are listed individually.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form, kind, valuePaiseOrPercent, rule.maxDiscount, rule.minOrderValue, unit, quantity]);

  /* ----------------------------------------------------------- overlaps */

  const overlaps = useMemo(() => {
    const self: OverlapCandidate = {
      id: id ?? 'draft',
      title: form.title || 'This promotion',
      startsAt: form.startsAt,
      endsAt: form.endsAt,
      priority: numberOr(form.priority, 0),
      valueKind: kind,
      value: valuePaiseOrPercent,
      type: form.type,
      categoryIds: form.categoryIds,
      brandIds: form.brandIds,
      sellerIds: form.sellerIds,
      productIds: [],
      paymentMethods: form.paymentMethods,
    };
    return peers
      .map((peer) => ({ peer, overlap: findOverlap(self, peer, names) }))
      .filter((entry) => entry.overlap !== null);
  }, [form, id, kind, valuePaiseOrPercent, peers, names]);

  /* --------------------------------------------------------------- save */

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const input: PromotionInput = {
      id,
      title: form.title,
      description: form.description,
      badgeText: form.badgeText,
      type: form.type,
      valueKind: kind,
      value: bxgy ? 0 : numberOr(form.value, 0),
      maxDiscount: kind === 'PERCENT' && form.maxDiscount ? numberOr(form.maxDiscount, 0) : null,
      minOrderValue: numberOr(form.minOrderValue, 0),
      buyQuantity: numberOr(form.buyQuantity, 1),
      getQuantity: numberOr(form.getQuantity, 1),
      bxgyPercent: numberOr(form.bxgyPercent, 100),
      applyTo: form.applyTo,
      categoryIds: form.categoryIds,
      brandIds: form.brandIds,
      sellerIds: form.sellerIds,
      paymentMethods: form.paymentMethods,
      bankName: form.bankName,
      priority: numberOr(form.priority, 0),
      stockLimit: form.type === 'FLASH_SALE' && form.stockLimit ? numberOr(form.stockLimit, 1) : null,
      fundedBy: form.fundedBy,
      startsAt: form.startsAt,
      endsAt: form.endsAt,
    };

    startTransition(async () => {
      const result = await savePromotion(input);
      if (!result.ok) {
        if (result.field) {
          setErrors({ [result.field]: result.error });
          document.querySelector(`[data-field="${result.field}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
        toast.error(result.error ?? 'That did not save.');
        return;
      }
      setSaved(form);
      toast.success(id ? (isLive ? 'Saved — prices update for shoppers now' : 'Saved') : 'Created, paused — switch it on when it is right');
      if (!id && result.id) router.push(`/admin/promotions/${result.id}`);
      else router.refresh();
    });
  };

  const preset = (days: number) => {
    const start = new Date();
    const end = new Date(start.getTime() + days * 86_400_000);
    end.setHours(23, 59, 0, 0);
    set('startsAt', start.toISOString());
    set('endsAt', end.toISOString());
  };

  return (
    <form onSubmit={submit} noValidate className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem] xl:grid-cols-[minmax(0,1fr)_26rem]">
      <div className="min-w-0 space-y-6">
        <Card title="The offer" description="What it is called, and what shoppers read on the product.">
          <div data-field="type">
            <Select
              label="Kind of offer"
              value={form.type}
              hint={TYPE_HINT[form.type]}
              onChange={(event) => {
                const type = event.target.value as PromotionInput['type'];
                set('type', type);
                if (FIXED_KIND[type]) set('valueKind', FIXED_KIND[type]!);
              }}
            >
              {(Object.keys(TYPE_HINT) as PromotionInput['type'][]).map((type) => (
                <option key={type} value={type}>
                  {PROMOTION_TYPE_LABEL[type]}
                </option>
              ))}
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <div data-field="title">
              <Input label="Title" value={form.title} maxLength={80} onChange={(event) => set('title', event.target.value)} placeholder="Diwali Festive Edit" error={errors.title} />
            </div>
            <Input
              label="Badge"
              value={form.badgeText}
              maxLength={24}
              onChange={(event) => set('badgeText', event.target.value)}
              placeholder="Festive 25% off"
              hint="On product cards. Optional."
            />
          </div>
          <div data-field="description">
            <Textarea
              label="Description"
              rows={2}
              maxLength={240}
              value={form.description}
              onChange={(event) => set('description', event.target.value)}
              placeholder="25% off ethnic wear across the shop, up to ₹1,000."
              error={errors.description}
            />
          </div>
        </Card>

        <Card title="The discount" description={bxgy ? 'How many to buy, and what the extra ones cost.' : 'How much comes off, and when items qualify.'}>
          {bxgy ? (
            <div className="grid gap-4 sm:grid-cols-4">
              <Input label="Buy" type="number" min={1} max={10} value={form.buyQuantity} onChange={(event) => set('buyQuantity', event.target.value)} />
              <Input label="Get" type="number" min={1} max={10} value={form.getQuantity} onChange={(event) => set('getQuantity', event.target.value)} />
              <Input label="At % off" type="number" min={1} max={100} value={form.bxgyPercent} onChange={(event) => set('bxgyPercent', event.target.value)} trailing="%" hint="100 means free." />
              <Select label="Which ones" value={form.applyTo} onChange={(event) => set('applyTo', event.target.value as PromotionDraft['applyTo'])}>
                <option value="CHEAPEST">Cheapest</option>
                <option value="MOST_EXPENSIVE">Most expensive</option>
              </Select>
            </div>
          ) : (
            <>
              {FIXED_KIND[form.type] ? null : (
                <Segmented
                  label="Percent or amount"
                  value={form.valueKind}
                  onChange={(value) => set('valueKind', value)}
                  options={[
                    { value: 'PERCENT', label: 'Percent off' },
                    { value: 'AMOUNT', label: 'Amount off' },
                  ]}
                />
              )}
              <div className="grid gap-4 sm:grid-cols-3">
                <div data-field="value">
                  <Input
                    label={kind === 'PERCENT' ? 'Percent off' : 'Amount off'}
                    type="number"
                    inputMode="decimal"
                    min={1}
                    max={kind === 'PERCENT' ? 80 : undefined}
                    value={form.value}
                    onChange={(event) => set('value', event.target.value)}
                    leading={kind === 'AMOUNT' ? RUPEE : undefined}
                    trailing={kind === 'PERCENT' ? '%' : undefined}
                    error={errors.value}
                  />
                </div>
                {kind === 'PERCENT' ? (
                  <Input
                    label="Maximum discount"
                    type="number"
                    min={0}
                    value={form.maxDiscount}
                    onChange={(event) => set('maxDiscount', event.target.value)}
                    leading={RUPEE}
                    hint="Blank means no cap."
                  />
                ) : null}
                <div data-field="minOrderValue">
                  <Input
                    label="Minimum of matching items"
                    type="number"
                    min={0}
                    value={form.minOrderValue}
                    onChange={(event) => set('minOrderValue', event.target.value)}
                    leading={RUPEE}
                    error={errors.minOrderValue}
                  />
                </div>
              </div>
            </>
          )}
          {form.type === 'FLASH_SALE' ? (
            <div data-field="stockLimit" className="max-w-xs">
              <Input
                label="Units at the sale price"
                type="number"
                min={1}
                value={form.stockLimit}
                onChange={(event) => set('stockLimit', event.target.value)}
                hint="Blank means no cap. The sale ends when they are gone."
                error={errors.stockLimit}
              />
            </div>
          ) : null}
        </Card>

        <Card
          title="Where it applies"
          description={
            form.categoryIds.length + form.brandIds.length + form.sellerIds.length === 0
              ? 'Nothing picked: it applies to everything in the shop.'
              : 'An item qualifies if it matches ANY of what is picked below.'
          }
        >
          <div className="grid gap-5 xl:grid-cols-3">
            <div data-field="categoryIds">
              <TargetPicker label="Categories" options={targets.categories} value={form.categoryIds} onChange={(value) => set('categoryIds', value)} error={errors.categoryIds} />
            </div>
            <div data-field="brandIds">
              <TargetPicker label="Brands" options={targets.brands} value={form.brandIds} onChange={(value) => set('brandIds', value)} error={errors.brandIds} />
            </div>
            <div data-field="sellerIds">
              <TargetPicker label="Stores" options={targets.sellers} value={form.sellerIds} onChange={(value) => set('sellerIds', value)} error={errors.sellerIds} />
            </div>
          </div>
        </Card>

        <Card title="Payment" description="Leave empty for any way to pay. A bank offer names its bank and methods.">
          <div data-field="paymentMethods" className="flex flex-wrap gap-2">
            {PAYMENT_METHODS.map((method) => {
              const on = form.paymentMethods.includes(method);
              return (
                <button
                  key={method}
                  type="button"
                  role="checkbox"
                  aria-checked={on}
                  onClick={() => set('paymentMethods', on ? form.paymentMethods.filter((item) => item !== method) : [...form.paymentMethods, method])}
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
          {errors.paymentMethods ? <p className="text-danger-600 text-xs">{errors.paymentMethods}</p> : null}
          {form.type === 'BANK_OFFER' ? (
            <div data-field="bankName" className="max-w-xs">
              <Input label="Bank" value={form.bankName} maxLength={40} onChange={(event) => set('bankName', event.target.value)} placeholder="HDFC Bank" error={errors.bankName} />
            </div>
          ) : null}
        </Card>

        <Card title="Dates, priority and funding" description="When it runs, what wins a tie, and who pays for it.">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-muted mr-1 text-xs">Quick dates:</span>
            {[1, 3, 7, 14].map((days) => (
              <Button key={days} type="button" size="xs" variant="secondary" onClick={() => preset(days)}>
                {days === 1 ? '24 hours' : `${days} days`}
              </Button>
            ))}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div data-field="startsAt">
              <Input label="Starts" type="datetime-local" value={mounted ? toLocalInput(form.startsAt) : ''} disabled={!mounted} onChange={(event) => set('startsAt', fromLocalInput(event.target.value))} error={errors.startsAt} />
            </div>
            <div data-field="endsAt">
              <Input label="Ends" type="datetime-local" value={mounted ? toLocalInput(form.endsAt) : ''} disabled={!mounted} onChange={(event) => set('endsAt', fromLocalInput(event.target.value))} error={errors.endsAt} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Priority"
              type="number"
              min={0}
              max={100}
              value={form.priority}
              onChange={(event) => set('priority', event.target.value)}
              hint="0–100. Breaks ties: when two offers take the same off an item, the higher priority is shown."
            />
            <div>
              <p className="text-ink mb-1.5 text-sm font-medium">Funded by</p>
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
            </div>
          </div>
        </Card>
      </div>

      {/* ------------------------------------------------------- preview */}
      <aside className="min-w-0 space-y-4 lg:sticky lg:top-20 lg:self-start">
        <section className="border-line bg-raised rounded-lg border p-4" aria-label="On a product">
          <p className="text-faint text-2xs font-semibold uppercase tracking-wider">On a product</p>
          <div className="border-line bg-canvas mt-3 flex gap-3 rounded-md border p-3">
            <div className="bg-sunken aspect-[3/4] w-20 shrink-0 rounded" aria-hidden />
            <div className="min-w-0 text-sm">
              {form.badgeText ? (
                <span className="bg-accent text-on-accent mb-1 inline-block rounded-sm px-1.5 py-0.5 text-2xs font-semibold">
                  {form.badgeText}
                </span>
              ) : null}
              <p className="text-ink font-medium">Example item</p>
              <p className="mt-1 flex flex-wrap items-baseline gap-x-2">
                <span className="text-ink font-semibold">{formatMoney(Math.max(0, unit * quantity - preview))}</span>
                {preview > 0 ? <span className="text-faint text-xs line-through">{formatMoney(unit * quantity)}</span> : null}
              </p>
              <p className="text-success-700 mt-0.5 text-xs font-medium">
                {preview > 0
                  ? `Saves ${formatMoney(preview)}${bxgy ? ` on ${quantity} items` : ''}`
                  : rule.minOrderValue > unit * quantity
                    ? `Needs ${formatMoney(rule.minOrderValue)} of matching items`
                    : 'No saving at this price'}
              </p>
              {form.paymentMethods.length > 0 ? (
                <p className="text-faint mt-1 text-2xs">Only when paying with {form.paymentMethods.map((method) => PAYMENT_METHOD_LABEL[method]).join(' or ')}.</p>
              ) : null}
            </div>
          </div>
          <label className="text-muted mt-3 flex items-center gap-2 text-xs">
            Item price
            <span className="border-line-control bg-canvas inline-flex items-center rounded-sm border px-2">
              {RUPEE}
              <input type="number" min={0} value={price} onChange={(event) => setPrice(event.target.value)} className="text-ink h-7 w-20 bg-transparent pl-1 text-xs outline-none" />
            </span>
          </label>
        </section>

        <section className="border-line bg-raised rounded-lg border p-4" aria-label="In plain words">
          <p className="text-faint text-2xs font-semibold uppercase tracking-wider">In plain words</p>
          <p className="text-ink mt-2 text-sm leading-relaxed">{describePromotion(rule, formatMoney)}</p>
        </section>

        <section
          className={cn('rounded-lg border p-4', overlaps.length ? 'border-warning-100 bg-warning-50' : 'border-line bg-raised')}
          aria-label="Overlaps"
        >
          <p className={cn('flex items-center gap-1.5 text-2xs font-semibold uppercase tracking-wider', overlaps.length ? 'text-warning-700' : 'text-faint')}>
            {overlaps.length ? <AlertTriangle className="size-3.5" aria-hidden /> : null}
            {overlaps.length ? `Overlaps ${overlaps.length} other ${overlaps.length === 1 ? 'offer' : 'offers'}` : 'No overlaps'}
          </p>
          {overlaps.length === 0 ? (
            <p className="text-muted mt-2 text-xs">Nothing else running at the same time covers the same items.</p>
          ) : (
            <ul className="mt-2 space-y-3">
              {overlaps.map(({ peer, overlap }) => (
                <li key={peer.id} className="text-xs">
                  <Link href={`/admin/promotions/${peer.id}`} className="text-ink font-semibold hover:underline">
                    {peer.title}
                  </Link>
                  {peer.isActive ? null : <span className="text-muted"> (paused)</span>}
                  <p className="text-muted mt-0.5">{overlap!.reason}</p>
                  <p className="text-ink mt-0.5">{overlap!.outcome}</p>
                </li>
              ))}
            </ul>
          )}
        </section>

        <div className="border-line bg-raised sticky bottom-3 flex items-center justify-between gap-3 rounded-lg border p-3 shadow-sm">
          <span className="text-xs" role="status">
            {dirty ? (
              <span className="text-warning-700 font-medium">{isLive ? 'Unsaved — this offer is live' : 'Unsaved changes'}</span>
            ) : (
              <span className="text-muted">{id ? 'All changes saved' : 'Saved paused, switched on separately'}</span>
            )}
          </span>
          <Button type="submit" disabled={pending || (!dirty && Boolean(id))}>
            <Save className="size-4" aria-hidden />
            {pending ? 'Saving…' : id ? 'Save changes' : 'Create promotion'}
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
