'use client';

import { Film, Plus, Trash2, Video } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { ChipButton, ChipSwatch } from '@/components/ui/chip';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { FileUpload } from '@/components/ui/file-upload';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { CATALOG } from '@/config/business';
import { COLORS, GENDERS, GENDER_LABEL, SIZE_SCALES } from '@/domain/attributes';
import type { Gender, MediaRole, SizeSystem } from '@/domain/types';
import type { UploadedFile } from '@/hooks/use-uploader';
import { cn } from '@/lib/cn';
import { toPaise } from '@/lib/money';
import {
  addBrand,
  addCategory,
  attachQuickMedia,
  publishQuickListing,
  removeQuickMedia,
} from '@/server/actions/catalog';

/**
 * Add a product.
 *
 * The whole of it, in one screen, ending in a product that is in the shop --
 * not a draft waiting for a queue. It replaced a form of forty-odd fields
 * spread over three saves, and the fields it dropped were not made optional by
 * accident: HSN codes, manufacturer addresses, net quantity and care
 * instructions all have defaults or are only needed on an invoice, so they
 * belong on the listing page afterwards, not between a seller and their first
 * sale.
 *
 * WHAT IS ACTUALLY REQUIRED: a name, where it belongs, a brand, a price, stock
 * and one photograph. That is the same list `publishBlockers` enforces on the
 * server, phrased the same way, so the button and the server never disagree.
 *
 * THREE MEDIA SLOTS, NOT ONE PILE. A gallery of photographs, ONE landscape
 * video for the product page, and up to five vertical clips for the reel feed.
 * They are separate drop zones because they are separate places -- a seller
 * dropping a portrait clip into "photos" and wondering why it never appears in
 * reels is the confusion this layout exists to prevent.
 *
 * The draft exists BEFORE this form is filled in: files have to belong to
 * something to be stored against it. See `startListing`.
 */

export interface ListingOption {
  id: string;
  name: string;
}

export interface CategoryOption extends ListingOption {
  sizeSystem: SizeSystem;
}

export interface AttachedMedia {
  id: string;
  url: string;
  kind: 'IMAGE' | 'VIDEO';
  role: MediaRole;
}

export interface QuickListingFormProps {
  /** The draft these uploads hang on, claimed before the form rendered. */
  productId: string;
  /** Set only when staff are listing on a store's behalf. */
  sellerId?: string;
  brands: ListingOption[];
  categories: CategoryOption[];
  parents: ListingOption[];
  media?: AttachedMedia[];
  /** Where "live" takes them: their own console, or the admin catalogue. */
  doneHref: string;
}

const IMAGE_TYPES = 'image/jpeg,image/png,image/webp,image/avif';
const VIDEO_TYPES = 'video/mp4';

/**
 * Server field names, translated to the inputs that show them.
 *
 * The server speaks in terms of the RECORD -- a selling price lives on a
 * variant, stock lives in its inventory -- while the form has one price box and
 * one stock box. Without this map a refusal from the server sets an error key
 * nothing renders, and the seller is left with a toast that fades and no idea
 * which field to fix.
 */
const FIELD_FOR_BLOCKER: Record<string, string> = {
  title: 'title',
  brandId: 'brandId',
  categoryId: 'categoryId',
  media: 'media',
  variants: 'price',
  sellingPrice: 'price',
  mrp: 'mrp',
  stock: 'stock',
};

export function QuickListingForm({
  productId,
  sellerId,
  brands: initialBrands,
  categories: initialCategories,
  parents,
  media: initialMedia = [],
  doneHref,
}: QuickListingFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [brands, setBrands] = useState(initialBrands);
  const [categories, setCategories] = useState(initialCategories);
  const [media, setMedia] = useState<AttachedMedia[]>(initialMedia);

  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [gender, setGender] = useState<Gender>('UNISEX');
  const [mrp, setMrp] = useState('');
  const [price, setPrice] = useState('');
  const [stock, setStock] = useState('1');
  const [sizes, setSizes] = useState<string[]>([]);
  const [color, setColor] = useState('multi');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const photos = media.filter((asset) => asset.role === 'GALLERY');
  const showcase = media.find((asset) => asset.role === 'SHOWCASE') ?? null;
  const reels = media.filter((asset) => asset.role === 'REEL');

  const category = categories.find((option) => option.id === categoryId);
  const sizeScale = SIZE_SCALES[category?.sizeSystem ?? 'ALPHA'];

  /* ------------------------------------------------------------- media */

  const attach = (role: MediaRole) => async (file: UploadedFile) => {
    const result = await attachQuickMedia({
      productId,
      sellerId,
      url: file.url,
      role,
      width: file.width,
      height: file.height,
    });

    if (!result.ok) {
      toast.error(result.error ?? 'That file could not be attached.');
      return;
    }
    setMedia((current) => [...current, ...(result.media ?? [])]);
    setErrors((current) => ({ ...current, media: '' }));
  };

  const detach = (mediaId: string) => {
    startTransition(async () => {
      const result = await removeQuickMedia({ productId, sellerId, mediaId });
      if (!result.ok) {
        toast.error(result.error ?? 'That could not be removed.');
        return;
      }
      setMedia((current) => current.filter((asset) => asset.id !== mediaId));
    });
  };

  /* ----------------------------------------------------------- publish */

  const publish = () => {
    const found: Record<string, string> = {};
    if (title.trim().length < 3) found.title = 'Give the product a name.';
    if (!categoryId) found.categoryId = 'Choose a category.';
    if (!brandId) found.brandId = 'Choose a brand, or add yours.';
    if (photos.length === 0) found.media = 'Add at least one photo.';

    const priceValue = Number(price);
    const mrpValue = Number(mrp || price);
    if (!priceValue || priceValue <= 0) found.price = 'Set a selling price.';
    else if (mrpValue < priceValue) found.mrp = 'MRP cannot be below the selling price.';

    setErrors(found);
    if (Object.keys(found).length > 0) {
      toast.error(Object.values(found)[0]);
      return;
    }

    startTransition(async () => {
      const result = await publishQuickListing({
        productId,
        sellerId,
        listing: {
          title: title.trim(),
          brandId,
          categoryId,
          gender,
          description: description.trim() || undefined,
          mrp: toPaise(mrpValue),
          sellingPrice: toPaise(priceValue),
          stock: Number(stock) || 0,
          sizes,
          color,
        },
      });

      if (!result.ok) {
        // The server's blockers are the same checks in the same words, so they
        // land under the same fields rather than as a second vocabulary.
        const blocked: Record<string, string> = {};
        for (const blocker of result.blockers ?? []) {
          blocked[FIELD_FOR_BLOCKER[blocker.field] ?? blocker.field] = blocker.message;
        }
        // Anything with no home of its own still has to be readable after the
        // toast has gone.
        if (result.blockers?.length && Object.keys(blocked).length === 0) {
          blocked.media = result.blockers[0].message;
        }
        setErrors(blocked);
        toast.error(result.blockers?.[0]?.message ?? result.error ?? 'That did not publish.');
        return;
      }

      toast.success('Live in the shop');
      router.push(doneHref);
      router.refresh();
    });
  };

  /* -------------------------------------------------------------- view */

  return (
    <div className="mt-6 space-y-5 pb-24">
      <Panel
        title="What is it?"
        description="The name shoppers search on, and where it sits in the shop."
      >
        <Input
          label="Product name"
          required
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          maxLength={140}
          placeholder="Hand block print cotton kurta"
          error={errors.title}
          hint="Include the material and the cut. This is what search matches on."
        />

        <div className="grid gap-4 sm:grid-cols-2">
          <WithAdd
            add={
              <NewCategoryDialog
                parents={parents}
                sellerId={sellerId}
                onCreated={(option) => {
                  setCategories((current) => [option, ...current]);
                  setCategoryId(option.id);
                }}
              />
            }
          >
            <Select
              label="Category"
              required
              value={categoryId}
              onChange={(event) => setCategoryId(event.target.value)}
              error={errors.categoryId}
            >
              <option value="">Choose a category…</option>
              {categories.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </Select>
          </WithAdd>

          <WithAdd
            add={
              <NewBrandDialog
                sellerId={sellerId}
                onCreated={(option) => {
                  setBrands((current) => [option, ...current]);
                  setBrandId(option.id);
                }}
              />
            }
          >
            <Select
              label="Brand"
              required
              value={brandId}
              onChange={(event) => setBrandId(event.target.value)}
              error={errors.brandId}
              hint={brands.length === 0 ? 'None yet — add yours, it goes live at once.' : undefined}
            >
              <option value="">Choose a brand…</option>
              {brands.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.name}
                </option>
              ))}
            </Select>
          </WithAdd>
        </div>

        <fieldset>
          <legend className="text-ink mb-1.5 text-xs font-medium">Made for</legend>
          <div className="flex flex-wrap gap-1.5">
            {GENDERS.map((value) => (
              <ChipButton
                key={value}
                type="button"
                active={gender === value}
                onClick={() => setGender(value)}
              >
                {GENDER_LABEL[value]}
              </ChipButton>
            ))}
          </div>
        </fieldset>
      </Panel>

      <Panel
        title="Photos"
        description="The first one is what shoppers see in every grid. Up to eight."
        error={errors.media}
      >
        {photos.length > 0 ? (
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {photos.map((asset, index) => (
              <li key={asset.id} className="group relative">
                <div className="bg-sunken relative aspect-3/4 overflow-hidden rounded-md">
                  <Image
                    src={asset.url}
                    alt=""
                    fill
                    sizes="(max-width: 40rem) 33vw, 140px"
                    className="object-cover"
                  />
                </div>
                {index === 0 ? (
                  <span className="bg-ink text-canvas absolute left-1 top-1 rounded px-1.5 py-0.5 text-3xs font-semibold">
                    Main
                  </span>
                ) : null}
                <RemoveButton onClick={() => detach(asset.id)} label="Remove photo" />
              </li>
            ))}
          </ul>
        ) : null}

        <FileUpload
          purpose="listing"
          accept={IMAGE_TYPES}
          multiple
          maxBytes={CATALOG.maxImageBytes}
          remaining={CATALOG.maxImagesPerProduct - photos.length}
          onUploaded={attach('GALLERY')}
          label="Drag photos here, or browse"
          hint={`JPEG, PNG, WebP or AVIF, up to ${CATALOG.maxImageBytes / 1024 / 1024}MB each.`}
        />
      </Panel>

      <Panel
        title="Video"
        description="One landscape clip on the product page, and up to five vertical clips for Reels."
      >
        <div className="grid gap-5 lg:grid-cols-2">
          <div>
            <SlotHeading icon={Video} title="Product video" note="Landscape · one" />
            {showcase ? (
              <div className="relative mt-2">
                <video
                  src={showcase.url}
                  className="bg-sunken aspect-video w-full rounded-md object-cover"
                  controls
                  playsInline
                  preload="metadata"
                />
                <RemoveButton onClick={() => detach(showcase.id)} label="Remove product video" />
              </div>
            ) : (
              <FileUpload
                className="mt-2"
                purpose="listing"
                accept={VIDEO_TYPES}
                multiple={false}
                maxBytes={CATALOG.maxVideoBytes}
                remaining={1}
                onUploaded={attach('SHOWCASE')}
                label="Add a landscape video"
                hint={`MP4, up to ${CATALOG.maxVideoBytes / 1024 / 1024}MB.`}
              />
            )}
          </div>

          <div>
            <SlotHeading
              icon={Film}
              title="Reels"
              note={`Vertical · ${reels.length} of ${CATALOG.maxReelsPerProduct}`}
            />
            {reels.length > 0 ? (
              <ul className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-5">
                {reels.map((asset) => (
                  <li key={asset.id} className="relative">
                    <video
                      src={asset.url}
                      className="bg-sunken aspect-9/16 w-full rounded-md object-cover"
                      playsInline
                      muted
                      preload="metadata"
                    />
                    <RemoveButton onClick={() => detach(asset.id)} label="Remove reel" />
                  </li>
                ))}
              </ul>
            ) : null}

            {reels.length < CATALOG.maxReelsPerProduct ? (
              <FileUpload
                className="mt-2"
                purpose="listing"
                accept={VIDEO_TYPES}
                multiple
                maxBytes={CATALOG.maxVideoBytes}
                remaining={CATALOG.maxReelsPerProduct - reels.length}
                onUploaded={attach('REEL')}
                label="Add vertical clips"
                hint="Shot upright, like a phone video."
              />
            ) : null}
          </div>
        </div>
      </Panel>

      <Panel title="Price and stock" description="What it sells for, and how many you have.">
        <div className="grid gap-4 sm:grid-cols-3">
          <Input
            label="Selling price"
            required
            inputMode="numeric"
            value={price}
            onChange={(event) => setPrice(event.target.value.replace(/[^0-9]/g, ''))}
            leading="₹"
            error={errors.price}
          />
          <Input
            label="MRP"
            inputMode="numeric"
            value={mrp}
            onChange={(event) => setMrp(event.target.value.replace(/[^0-9]/g, ''))}
            leading="₹"
            hint="Left blank, the selling price is used."
            error={errors.mrp}
          />
          <Input
            label="Stock"
            inputMode="numeric"
            value={stock}
            onChange={(event) => setStock(event.target.value.replace(/[^0-9]/g, ''))}
            hint="Per size, if you pick sizes."
            error={errors.stock}
          />
        </div>

        <fieldset>
          <legend className="text-ink text-xs font-medium">Sizes</legend>
          <p className="text-muted mt-0.5 mb-2 text-xs">
            {category
              ? `Optional. Nothing picked means one size. Scale: ${sizeScale.label}.`
              : 'Choose a category first — it decides which sizes apply.'}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {sizeScale.sizes.map((size) => (
              <ChipButton
                key={size}
                type="button"
                showCheck
                active={sizes.includes(size)}
                onClick={() =>
                  setSizes((current) =>
                    current.includes(size)
                      ? current.filter((value) => value !== size)
                      : [...current, size],
                  )
                }
              >
                {size}
              </ChipButton>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-ink text-xs font-medium">Colour</legend>
          <p className="text-muted mt-0.5 mb-2 text-xs">
            Shoppers filter by this. Multicolour is fine when it is not one colour.
          </p>
          <div className="flex flex-wrap gap-1.5">
            {COLORS.map((option) => (
              <ChipSwatch
                key={option.value}
                type="button"
                hex={option.hex}
                label={option.label}
                active={color === option.value}
                onClick={() => setColor(option.value)}
              />
            ))}
          </div>
        </fieldset>
      </Panel>

      <Panel
        title="Description"
        description="Optional. Two sentences on the fabric, fit and finish sell better than none."
      >
        <Textarea
          label="Description"
          hideLabel
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          rows={4}
          maxLength={4000}
          placeholder="Hand block printed on soft cotton voile, with a relaxed A-line cut and side pockets."
        />
      </Panel>

      {/*
        The publish bar stays on screen.

        This form is long enough to scroll on a phone, and a button that has
        scrolled away is a form people abandon believing it did not save.
      */}
      <div className="border-line bg-raised fixed inset-x-0 bottom-0 z-30 border-t px-4 py-3 sm:px-6 lg:pl-(--console-rail)">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4">
          <p className="text-muted text-xs">
            Goes live straight away. The catalogue team sees it afterwards.
          </p>
          <Button type="button" onClick={publish} disabled={pending}>
            {pending ? 'Publishing…' : 'Publish to the shop'}
          </Button>
        </div>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- pieces */

function Panel({
  title,
  description,
  error,
  children,
}: {
  title: string;
  description: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        'border-line bg-raised rounded-lg border p-4 sm:p-5',
        error && 'border-danger-200',
      )}
    >
      <header className="mb-4">
        <h2 className="text-ink text-sm font-semibold">{title}</h2>
        <p className="text-muted mt-0.5 text-xs">{description}</p>
        {error ? <p className="text-danger-700 mt-1 text-xs">{error}</p> : null}
      </header>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

/** A field with its own "add one" button, aligned to the input rather than the label. */
function WithAdd({ add, children }: { add: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      {children}
      <div className="mt-1.5">{add}</div>
    </div>
  );
}

function SlotHeading({
  icon: Icon,
  title,
  note,
}: {
  icon: typeof Video;
  title: string;
  note: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="text-faint size-4" aria-hidden />
      <h3 className="text-ink text-xs font-medium">{title}</h3>
      <span className="text-faint text-2xs">{note}</span>
    </div>
  );
}

function RemoveButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={cn(
        'absolute right-1 top-1 grid size-7 place-items-center rounded-full',
        'bg-black/60 text-white backdrop-blur-sm transition-opacity',
        'hover:bg-black/80 focus-visible:outline-accent focus-visible:outline-2',
      )}
    >
      <Trash2 className="size-3.5" aria-hidden />
    </button>
  );
}

/* -------------------------------------------------------------- dialogs */

function NewBrandDialog({
  sellerId,
  onCreated,
}: {
  sellerId?: string;
  onCreated: (option: ListingOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  const submit = () => {
    startTransition(async () => {
      const result = await addBrand({ name: name.trim(), sellerId });
      if (!result.ok || !result.brandId) {
        setError(result.error ?? 'That did not save.');
        return;
      }
      onCreated({ id: result.brandId, name: name.trim() });
      toast.success(`${name.trim()} added`);
      setName('');
      setError('');
      setOpen(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="xs">
          <Plus className="size-3.5" aria-hidden />
          Add a brand
        </Button>
      </DialogTrigger>
      <DialogContent title="Add a brand" description="It goes live at once and can be edited later.">
        <Input
          label="Brand name"
          required
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
          placeholder="Mora Label"
          error={error}
          autoFocus
        />
        <div className="mt-4 flex justify-end gap-2">
          <DialogClose asChild>
            <Button type="button" variant="ghost" size="sm" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="button"
            size="sm"
            onClick={submit}
            disabled={pending || name.trim().length < 2}
          >
            {pending ? 'Adding…' : 'Add brand'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function NewCategoryDialog({
  parents,
  sellerId,
  onCreated,
}: {
  parents: ListingOption[];
  sellerId?: string;
  onCreated: (option: CategoryOption) => void;
}) {
  const [open, setOpen] = useState(false);
  const [parentId, setParentId] = useState(parents[0]?.id ?? '');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [pending, startTransition] = useTransition();

  const submit = () => {
    startTransition(async () => {
      const result = await addCategory({ parentId, name: name.trim(), sellerId });
      if (!result.ok || !result.categoryId) {
        setError(result.error ?? 'That did not save.');
        return;
      }
      const parent = parents.find((option) => option.id === parentId);
      onCreated({
        id: result.categoryId,
        name: parent ? `${parent.name} › ${name.trim()}` : name.trim(),
        // It inherits the parent's scale, and the picker only needs to know
        // which sizes to offer until the page is next loaded.
        sizeSystem: 'ALPHA',
      });
      toast.success(`${name.trim()} added`);
      setName('');
      setError('');
      setOpen(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" variant="ghost" size="xs">
          <Plus className="size-3.5" aria-hidden />
          Add a category
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Add a category"
        description="It sits under an existing one and inherits its size chart and tax slab."
      >
        <div className="space-y-4">
          <Select
            label="Sits under"
            value={parentId}
            onChange={(event) => setParentId(event.target.value)}
          >
            {parents.map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </Select>
          <Input
            label="Category name"
            required
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={60}
            placeholder="Block print kurtas"
            error={error}
          />
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <DialogClose asChild>
            <Button type="button" variant="ghost" size="sm" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="button"
            size="sm"
            onClick={submit}
            disabled={pending || name.trim().length < 2 || !parentId}
          >
            {pending ? 'Adding…' : 'Add category'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
