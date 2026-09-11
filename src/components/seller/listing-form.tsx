'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { attributesForFamily, GENDER_LABEL, GENDERS } from '@/domain/attributes';
import type { Product } from '@/domain/types';
import { saveListing } from '@/server/actions/authoring';

import { Field, Section, TagInput } from './listing-fields';

/**
 * The listing details form.
 *
 * Long by nature — a catalogue entry genuinely has this many fields — so it is
 * broken into sections a seller can work through in order rather than one wall
 * of inputs. The variant grid and the media manager are separate components
 * because they are separate saves: a seller adding a size should not have to
 * re-submit their description.
 *
 * The attribute section is DERIVED from the chosen category. Picking "Kurtas"
 * asks about sleeve and neck; picking "Sneakers" does not. Those definitions
 * come from the same vocabulary the storefront filters on, so a seller can
 * never fill in an attribute nobody can search by.
 */

export interface AuthoringOption {
  id: string;
  name: string;
  attributeFamily?: string;
  sizeSystem?: string;
}

export function ListingForm({
  product,
  brands,
  categories,
}: {
  product: Product | null;
  brands: AuthoringOption[];
  categories: AuthoringOption[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [title, setTitle] = useState(product?.title ?? '');
  const [brandId, setBrandId] = useState(product?.brandId ?? '');
  const [categoryId, setCategoryId] = useState(product?.categoryId ?? '');
  const [gender, setGender] = useState(product?.gender ?? 'WOMEN');
  const [description, setDescription] = useState(product?.description ?? '');
  const [highlights, setHighlights] = useState<string[]>(product?.highlights ?? []);
  const [attributes, setAttributes] = useState<Record<string, string | string[]>>(
    product?.attributes ?? {},
  );
  const [care, setCare] = useState<string[]>(product?.careInstructions ?? []);
  const [countryOfOrigin, setCountry] = useState(product?.countryOfOrigin ?? 'India');
  const [manufacturerName, setManufacturer] = useState(product?.manufacturerName ?? '');
  const [manufacturerAddress, setManufacturerAddress] = useState(
    product?.manufacturerAddress ?? '',
  );
  const [netQuantity, setNetQuantity] = useState(product?.netQuantity ?? '1 piece');
  const [hsnCode, setHsn] = useState(product?.hsnCode ?? '');
  const [returnable, setReturnable] = useState(product?.returnable ?? true);
  const [returnWindowDays, setWindow] = useState(product?.returnWindowDays ?? 14);
  const [exchangeable, setExchangeable] = useState(product?.exchangeable ?? true);
  const [codAvailable, setCod] = useState(product?.codAvailable ?? true);
  const [metaTitle, setMetaTitle] = useState(product?.metaTitle ?? '');
  const [metaDescription, setMetaDescription] = useState(product?.metaDescription ?? '');

  const category = categories.find((option) => option.id === categoryId);
  const attributeGroups = category?.attributeFamily
    ? attributesForFamily(category.attributeFamily)
    : [];

  const submit = () => {
    if (!title.trim()) {
      toast.error('Give the style a title');
      return;
    }

    startTransition(async () => {
      const result = await saveListing({
        productId: product?.id,
        draft: {
          title,
          brandId,
          categoryId,
          gender,
          description,
          highlights,
          attributes,
          careInstructions: care,
          countryOfOrigin,
          manufacturerName,
          manufacturerAddress,
          netQuantity,
          hsnCode,
          returnable,
          returnWindowDays,
          exchangeable,
          codAvailable,
          metaTitle: metaTitle || undefined,
          metaDescription: metaDescription || undefined,
        },
      });

      if (!result.ok) {
        toast.error(result.error ?? 'That did not save.');
        return;
      }

      if (result.requiresReview) {
        // Worth interrupting for: the seller changed something material and
        // their live listing has just come down until it is re-approved.
        toast.warning('Saved. Because the title, brand or category changed, this listing has gone back for review.');
      } else {
        toast.success('Saved');
      }

      if (!product && result.productId) {
        router.replace(`/seller/products/${result.productId}`);
      } else {
        router.refresh();
      }
    });
  };

  return (
    <div className="space-y-6">
      <Section title="Basics" description="What this style is, and where it belongs.">
        <Field label="Title" hint="Shoppers search on this. Include the brand, material and cut.">
          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            maxLength={140}
            placeholder="Hand block print cotton A-line kurta"
            className="border-line-strong bg-canvas text-ink h-9 w-full rounded-sm border px-2.5 text-sm"
          />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Brand"
            hint={
              brands.length === 0
                ? 'No brands have been added yet. Save a draft now: a brand is needed before it can go live, and the VestraWAB team adds brands on request.'
                : undefined
            }
          >
            <select
              value={brandId}
              onChange={(event) => setBrandId(event.target.value)}
              className="border-line-strong bg-canvas text-ink h-9 w-full rounded-sm border px-2 text-sm"
            >
              <option value="">Choose a brand…</option>
              {brands.map((brand) => (
                <option key={brand.id} value={brand.id}>
                  {brand.name}
                </option>
              ))}
            </select>
          </Field>

          <Field label="Category" hint="Decides the size chart, tax slab and filters.">
            <select
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              className="border-line-strong bg-canvas text-ink h-9 w-full rounded-sm border px-2 text-sm"
            >
              <option value="">Choose a category…</option>
              {categories.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <Field label="Shopper">
          <div className="flex flex-wrap gap-1.5">
            {GENDERS.map((value) => (
              <button
                key={value}
                type="button"
                onClick={() => setGender(value)}
                aria-pressed={gender === value}
                className={
                  gender === value
                    ? 'bg-ink text-canvas rounded-sm px-2.5 py-1.5 text-xs font-medium'
                    : 'border-line-strong text-muted hover:border-ink hover:text-ink rounded-sm border px-2.5 py-1.5 text-xs transition-colors'
                }
              >
                {GENDER_LABEL[value]}
              </button>
            ))}
          </div>
        </Field>
      </Section>

      <Section title="Description" description="What a shopper reads before deciding.">
        <Field label="Description" hint="Fabric, fit, finish. Two or three sentences is plenty.">
          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={5}
            maxLength={4000}
            className="border-line-strong bg-canvas text-ink w-full rounded-sm border px-2.5 py-2 text-sm"
          />
        </Field>

        <Field label="Highlights" hint="Short points shown above the fold. Press Enter to add.">
          <TagInput values={highlights} onChange={setHighlights} max={8} placeholder="Breathable cotton voile" />
        </Field>
      </Section>

      {/*
        Only rendered once a category is chosen, because until then we do not
        know which attributes apply — and guessing produces a form asking about
        sleeve length on a handbag.
      */}
      {attributeGroups.length > 0 ? (
        <Section title="Attributes" description="These become the filters shoppers browse by.">
          <div className="grid gap-4 sm:grid-cols-2">
            {attributeGroups.map((group) => (
              <Field
                key={group.key}
                label={group.label}
                hint={group.required ? 'Required before review' : undefined}
              >
                {group.multi ? (
                  <div className="flex flex-wrap gap-1.5">
                    {group.options.slice(0, 12).map((option) => {
                      const current = attributes[group.key];
                      const selected = Array.isArray(current) && current.includes(option.value);
                      return (
                        <button
                          key={option.value}
                          type="button"
                          aria-pressed={selected}
                          onClick={() => {
                            const list = Array.isArray(current) ? current : [];
                            setAttributes({
                              ...attributes,
                              [group.key]: selected
                                ? list.filter((value) => value !== option.value)
                                : [...list, option.value],
                            });
                          }}
                          className={
                            selected
                              ? 'bg-ink text-canvas rounded-sm px-2 py-1 text-2xs font-medium'
                              : 'border-line-strong text-muted hover:border-ink rounded-sm border px-2 py-1 text-2xs transition-colors'
                          }
                        >
                          {option.label}
                        </button>
                      );
                    })}
                  </div>
                ) : (
                  <select
                    value={typeof attributes[group.key] === 'string' ? (attributes[group.key] as string) : ''}
                    onChange={(event) =>
                      setAttributes({ ...attributes, [group.key]: event.target.value })
                    }
                    className="border-line-strong bg-canvas text-ink h-9 w-full rounded-sm border px-2 text-sm"
                  >
                    <option value="">Not set</option>
                    {group.options.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                )}
              </Field>
            ))}
          </div>
        </Section>
      ) : null}

      <Section title="Care and compliance" description="Required on the listing by Indian law.">
        <Field label="Care instructions" hint="Press Enter to add.">
          <TagInput values={care} onChange={setCare} max={12} placeholder="Machine wash cold" />
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Country of origin">
            <input
              value={countryOfOrigin}
              onChange={(event) => setCountry(event.target.value)}
              className="border-line-strong bg-canvas text-ink h-9 w-full rounded-sm border px-2.5 text-sm"
            />
          </Field>
          <Field label="Net quantity">
            <input
              value={netQuantity}
              onChange={(event) => setNetQuantity(event.target.value)}
              className="border-line-strong bg-canvas text-ink h-9 w-full rounded-sm border px-2.5 text-sm"
            />
          </Field>
          <Field label="Manufacturer">
            <input
              value={manufacturerName}
              onChange={(event) => setManufacturer(event.target.value)}
              className="border-line-strong bg-canvas text-ink h-9 w-full rounded-sm border px-2.5 text-sm"
            />
          </Field>
          <Field label="HSN code" hint="Drives the GST slab on the invoice.">
            <input
              value={hsnCode}
              onChange={(event) => setHsn(event.target.value)}
              maxLength={12}
              className="border-line-strong bg-canvas text-ink h-9 w-full rounded-sm border px-2.5 font-mono text-sm"
            />
          </Field>
        </div>

        <Field label="Manufacturer address">
          <textarea
            value={manufacturerAddress}
            onChange={(event) => setManufacturerAddress(event.target.value)}
            rows={2}
            className="border-line-strong bg-canvas text-ink w-full rounded-sm border px-2.5 py-2 text-sm"
          />
        </Field>
      </Section>

      <Section title="Policies" description="What the shopper is promised at checkout.">
        <div className="space-y-2.5">
          <Toggle checked={returnable} onChange={setReturnable} label="Accepts returns" />
          {returnable ? (
            <Field label="Return window">
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min={0}
                  max={60}
                  value={returnWindowDays}
                  onChange={(event) => setWindow(Number(event.target.value))}
                  className="border-line-strong bg-canvas text-ink tabular h-9 w-20 rounded-sm border px-2.5 text-sm"
                />
                <span className="text-muted text-sm">days from delivery</span>
              </div>
            </Field>
          ) : null}
          <Toggle checked={exchangeable} onChange={setExchangeable} label="Accepts size exchanges" />
          <Toggle checked={codAvailable} onChange={setCod} label="Cash on delivery" />
        </div>
      </Section>

      <Section
        title="Search listing"
        description="How this appears in Google. Left blank, we generate it from the title."
      >
        <Field label="Meta title" hint={`${metaTitle.length}/70`}>
          <input
            value={metaTitle}
            onChange={(event) => setMetaTitle(event.target.value)}
            maxLength={70}
            className="border-line-strong bg-canvas text-ink h-9 w-full rounded-sm border px-2.5 text-sm"
          />
        </Field>
        <Field label="Meta description" hint={`${metaDescription.length}/180`}>
          <textarea
            value={metaDescription}
            onChange={(event) => setMetaDescription(event.target.value)}
            rows={2}
            maxLength={180}
            className="border-line-strong bg-canvas text-ink w-full rounded-sm border px-2.5 py-2 text-sm"
          />
        </Field>
      </Section>

      <div className="border-line bg-raised sticky bottom-0 -mx-4 flex items-center justify-between gap-3 border-t px-4 py-3 sm:-mx-6 sm:px-6">
        <p className="text-faint text-2xs">
          {product ? 'Changes apply when you save.' : 'Saving creates a draft you can come back to.'}
        </p>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="bg-ink text-canvas disabled:bg-line-strong shrink-0 rounded-md px-4 py-2 text-xs font-medium disabled:cursor-wait"
        >
          {pending ? 'Saving…' : product ? 'Save changes' : 'Create draft'}
        </button>
      </div>
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (value: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="accent-ink size-4"
      />
      <span className="text-ink text-sm">{label}</span>
    </label>
  );
}
