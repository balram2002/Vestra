'use client';

import { Pencil } from 'lucide-react';
import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/choice';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { FileUpload } from '@/components/ui/file-upload';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { updateBrandDetails, updateCategoryDetails } from '@/server/actions/catalog-details';

/**
 * Making a brand or a category presentable.
 *
 * Both records can now be created by a seller who simply needed one to list
 * against, which means the catalogue fills up with names that have no picture
 * and no description. This is where that gets fixed -- and it is the only place
 * in the console where the PICTURES behind the category strip and the brand
 * rail can be changed at all.
 *
 * The dialog is remounted on every open (a fresh `key`), so a second brand
 * never opens showing the first one's draft.
 */

function useSave(onDone: () => void) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState('');

  const save = (action: () => Promise<{ ok: boolean; error?: string }>) => {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? 'That did not save.');
        return;
      }
      setError('');
      toast.success('Saved');
      onDone();
      router.refresh();
    });
  };

  return { pending, error, save };
}

function Picture({
  url,
  onChange,
  label,
  hint,
  square = false,
}: {
  url: string;
  onChange: (url: string) => void;
  label: string;
  hint: string;
  square?: boolean;
}) {
  const previewable = /^(https:\/\/\S+|\/\S+)$/.test(url);

  return (
    <fieldset className="border-line space-y-3 rounded-md border p-3">
      <legend className="text-ink px-1 text-xs font-medium">{label}</legend>

      {previewable ? (
        <div
          className={`bg-sunken relative overflow-hidden rounded-md ${square ? 'size-20' : 'aspect-[16/9] w-full'}`}
        >
          <Image src={url} alt="" fill sizes="(max-width: 40rem) 90vw, 20rem" className="object-cover" />
        </div>
      ) : null}

      <FileUpload
        purpose="listing"
        multiple={false}
        label={url ? 'Replace it: drag one here, or browse' : 'Drag a picture here, or browse'}
        hint={hint}
        onUploaded={(file) => onChange(file.url)}
      />

      <Input
        label="Or a link"
        hideLabel
        value={url}
        onChange={(event) => onChange(event.target.value)}
        placeholder="https://"
      />
    </fieldset>
  );
}

export function EditBrandDialog({
  brand,
}: {
  brand: {
    id: string;
    name: string;
    description: string;
    logoUrl: string;
    bannerUrl: string | null;
    isPremium: boolean;
    isActive: boolean;
  };
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="xs" variant="ghost">
          <Pencil className="size-3.5" aria-hidden />
          Edit
        </Button>
      </DialogTrigger>
      {open ? <BrandForm key={brand.id} brand={brand} onDone={() => setOpen(false)} /> : null}
    </Dialog>
  );
}

function BrandForm({
  brand,
  onDone,
}: {
  brand: {
    id: string;
    name: string;
    description: string;
    logoUrl: string;
    bannerUrl: string | null;
    isPremium: boolean;
    isActive: boolean;
  };
  onDone: () => void;
}) {
  const { pending, error, save } = useSave(onDone);
  const [name, setName] = useState(brand.name);
  const [description, setDescription] = useState(brand.description);
  const [logoUrl, setLogoUrl] = useState(brand.logoUrl);
  const [bannerUrl, setBannerUrl] = useState(brand.bannerUrl ?? '');
  const [isPremium, setIsPremium] = useState(brand.isPremium);
  const [isActive, setIsActive] = useState(brand.isActive);

  return (
    <DialogContent
      title={`Edit ${brand.name}`}
      description="The name, the words on its page, and the pictures shoppers see."
      size="lg"
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-danger-600 text-xs">{error}</p>
          <div className="flex gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost" size="sm" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={() =>
                save(() =>
                  updateBrandDetails({
                    brandId: brand.id,
                    name,
                    description,
                    logoUrl,
                    bannerUrl,
                    isPremium,
                    isActive,
                  }),
                )
              }
            >
              {pending ? 'Saving…' : 'Save brand'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <Input
          label="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={80}
        />
        <Textarea
          label="Description"
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={400}
          hint="Shown at the top of the brand's page."
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <Picture
            label="Logo"
            square
            url={logoUrl}
            onChange={setLogoUrl}
            hint="Square, on a plain ground."
          />
          <Picture
            label="Banner"
            url={bannerUrl}
            onChange={setBannerUrl}
            hint="Wide. Optional — the page reads fine without one."
          />
        </div>

        <div className="divide-line divide-y">
          <Switch
            label="Premium"
            description="Sorts it to the front of brand listings."
            checked={isPremium}
            onChange={(event) => setIsPremium(event.target.checked)}
          />
          <Switch
            label="Shown in the shop"
            description="Hiding it leaves its products reachable by link."
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
          />
        </div>
      </div>
    </DialogContent>
  );
}

export function EditCategoryDialog({
  category,
}: {
  category: {
    id: string;
    name: string;
    description: string;
    imageUrl: string;
    bannerUrl: string | null;
    featured: boolean;
    isActive: boolean;
  };
}) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="xs" variant="ghost">
          <Pencil className="size-3.5" aria-hidden />
          Edit
        </Button>
      </DialogTrigger>
      {open ? (
        <CategoryForm key={category.id} category={category} onDone={() => setOpen(false)} />
      ) : null}
    </Dialog>
  );
}

function CategoryForm({
  category,
  onDone,
}: {
  category: {
    id: string;
    name: string;
    description: string;
    imageUrl: string;
    bannerUrl: string | null;
    featured: boolean;
    isActive: boolean;
  };
  onDone: () => void;
}) {
  const { pending, error, save } = useSave(onDone);
  const [name, setName] = useState(category.name);
  const [description, setDescription] = useState(category.description);
  const [imageUrl, setImageUrl] = useState(category.imageUrl);
  const [bannerUrl, setBannerUrl] = useState(category.bannerUrl ?? '');
  const [featured, setFeatured] = useState(category.featured);
  const [isActive, setIsActive] = useState(category.isActive);

  return (
    <DialogContent
      title={`Edit ${category.name}`}
      description="Its name, its words, and the picture on the homepage strip."
      size="lg"
      footer={
        <div className="flex items-center justify-between gap-3">
          <p className="text-danger-600 text-xs">{error}</p>
          <div className="flex gap-2">
            <DialogClose asChild>
              <Button type="button" variant="ghost" size="sm" disabled={pending}>
                Cancel
              </Button>
            </DialogClose>
            <Button
              type="button"
              size="sm"
              disabled={pending}
              onClick={() =>
                save(() =>
                  updateCategoryDetails({
                    categoryId: category.id,
                    name,
                    description,
                    imageUrl,
                    bannerUrl,
                    featured,
                    isActive,
                  }),
                )
              }
            >
              {pending ? 'Saving…' : 'Save category'}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <Input
          label="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={60}
          hint="The address stays as it is, so existing links keep working."
        />
        <Textarea
          label="Description"
          rows={3}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={300}
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <Picture
            label="Tile picture"
            url={imageUrl}
            onChange={setImageUrl}
            hint="Square-ish. This is what the homepage strip shows."
          />
          <Picture
            label="Banner"
            url={bannerUrl}
            onChange={setBannerUrl}
            hint="Wide, across the top of the category page. Optional."
          />
        </div>

        <div className="divide-line divide-y">
          <Switch
            label="Featured in the menu"
            description="Shows in the mega menu even with nothing in it yet."
            checked={featured}
            onChange={(event) => setFeatured(event.target.checked)}
          />
          <Switch
            label="Shown in the shop"
            checked={isActive}
            onChange={(event) => setIsActive(event.target.checked)}
          />
        </div>
      </div>
    </DialogContent>
  );
}
