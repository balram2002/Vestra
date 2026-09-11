'use client';

import { ArrowDown, ArrowUp, Pencil, Plus, Sparkles } from 'lucide-react';
import Image from 'next/image';
import { useId, useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { FileUpload } from '@/components/ui/file-upload';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import type { Banner } from '@/domain/types';
import { cn } from '@/lib/cn';
import {
  adoptDefaultHeroSlides,
  createBanner,
  deleteBanner,
  moveBanner,
  setBannerActive,
  updateBanner,
  type BannerInput,
} from '@/server/actions/admin';

/**
 * Homepage banners, managed.
 *
 * Everything an administrator does to the hero and the tile grid: add a slide,
 * edit its picture, words and link, move it earlier or later, take it down for
 * a while, or delete it. The form is REMOUNTED on every open, so a second
 * banner never starts with the first one's fields or errors, and the server
 * action is the validator: it names the field an error belongs to.
 */

type FieldErrors = Partial<Record<string, string>>;
type Placement = 'HOME_HERO' | 'HOME_GRID';

/** A link worth previewing: an upload, or a complete https address. */
const previewable = (url: string) => /^(https:\/\/[^\s/]+\.[^\s/]+\/\S*|\/api\/media\/\S+)$/.test(url);

function useRun() {
  const [pending, startTransition] = useTransition();

  const run = (
    fn: () => Promise<{ ok: boolean; error?: string }>,
    success: string,
    onDone?: () => void,
  ) => {
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        toast.success(success);
        onDone?.();
      } else {
        toast.error(result.error ?? 'That did not work.');
      }
    });
  };

  return { pending, run };
}

/* ------------------------------------------------------------ add or edit */

/**
 * The add or edit dialog. With a `banner` it edits that one; without, it adds
 * a new one to the row named by `placement`.
 */
export function BannerDialog({ banner, placement }: { banner?: Banner; placement?: Placement }) {
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
        {banner ? (
          <Button type="button" size="xs" variant="ghost" aria-label={`Edit ${banner.name}`}>
            <Pencil className="size-3" aria-hidden />
            Edit
          </Button>
        ) : (
          <Button type="button" size="sm">
            <Plus className="size-3.5" aria-hidden />
            {placement === 'HOME_GRID' ? 'Add tile' : 'Add slide'}
          </Button>
        )}
      </DialogTrigger>
      <BannerForm key={key} banner={banner} placement={placement} onDone={() => setOpen(false)} />
    </Dialog>
  );
}

function BannerForm({
  banner,
  placement,
  onDone,
}: {
  banner?: Banner;
  placement?: Placement;
  onDone: () => void;
}) {
  const formId = useId();
  const [errors, setErrors] = useState<FieldErrors>({});
  const [imageUrl, setImageUrl] = useState(banner?.imageUrl ?? '');
  const [pending, startTransition] = useTransition();

  const submit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const read = (key: string) => String(form.get(key) ?? '').trim();

    const input: BannerInput = {
      name: read('name'),
      placement: read('placement') === 'HOME_GRID' ? 'HOME_GRID' : 'HOME_HERO',
      imageUrl: imageUrl.trim(),
      alt: read('alt'),
      eyebrow: read('eyebrow'),
      headline: read('headline'),
      subheadline: read('subheadline'),
      ctaLabel: read('ctaLabel'),
      href: read('href'),
    };

    setErrors({});
    startTransition(async () => {
      const result = banner
        ? await updateBanner({ ...input, bannerId: banner.id })
        : await createBanner(input);

      if (result.ok) {
        toast.success(banner ? `${input.name} saved` : `${input.name} is live`, {
          description: 'The homepage shows it now.',
        });
        onDone();
      } else if (result.field) {
        setErrors({ [result.field]: result.error });
      } else {
        toast.error(result.error ?? 'Could not save the banner.');
      }
    });
  };

  return (
    <DialogContent
      title={banner ? `Edit ${banner.name}` : placement === 'HOME_GRID' ? 'New grid tile' : 'New hero slide'}
      description="A banner sends shoppers to a category, a brand, a search or any page on the site."
      size="lg"
      footer={
        <>
          <DialogClose asChild>
            <Button type="button" variant="ghost" size="sm" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button type="submit" form={formId} size="sm" loading={pending}>
            {banner ? 'Save banner' : 'Add banner'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} noValidate className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <Input
            label="Name"
            name="name"
            required
            maxLength={60}
            defaultValue={banner?.name}
            placeholder="Festive edit"
            hint="Only shown in this console."
            error={errors.name}
          />
          <Select
            label="Where it shows"
            name="placement"
            defaultValue={banner?.placement ?? placement ?? 'HOME_HERO'}
            error={errors.placement}
          >
            <option value="HOME_HERO">Homepage hero, full width</option>
            <option value="HOME_GRID">Homepage tile grid</option>
          </Select>
        </div>

        <fieldset className="space-y-3">
          <legend className="text-ink mb-3 text-sm font-semibold">Image</legend>

          {previewable(imageUrl) ? (
            <div className="bg-sunken relative aspect-[21/9] overflow-hidden rounded-md">
              <Image src={imageUrl} alt="" fill sizes="(max-width: 40rem) 90vw, 40rem" className="object-cover" />
            </div>
          ) : null}

          <FileUpload
            purpose="listing"
            multiple={false}
            label={imageUrl ? 'Replace the image: drag it here, or browse' : 'Drag the image here, or browse'}
            hint="Wide, at least 1600 by 900 pixels. The words sit on it in white, so keep that area darker."
            onUploaded={(file) => setImageUrl(file.url)}
          />
          <Input
            label="Or a link to the image"
            name="imageUrl"
            type="url"
            inputMode="url"
            placeholder="https://"
            value={imageUrl}
            onChange={(event) => setImageUrl(event.target.value)}
            error={errors.imageUrl}
          />
          <Input
            label="Describe the image"
            name="alt"
            required
            maxLength={160}
            defaultValue={banner?.alt}
            placeholder="What the photograph shows"
            hint="Read aloud to people who cannot see it."
            error={errors.alt}
          />
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-ink mb-3 text-sm font-semibold">Words and link</legend>
          <div className="grid gap-4 sm:grid-cols-[12rem_minmax(0,1fr)]">
            <Input
              label="Label"
              name="eyebrow"
              maxLength={40}
              defaultValue={banner?.eyebrow ?? ''}
              placeholder="Women"
              hint="Optional. Small, above the headline."
              error={errors.eyebrow}
            />
            <Input
              label="Headline"
              name="headline"
              maxLength={80}
              defaultValue={banner?.headline ?? ''}
              hint="Optional."
              error={errors.headline}
            />
          </div>
          <Input
            label="Supporting line"
            name="subheadline"
            maxLength={160}
            defaultValue={banner?.subheadline ?? ''}
            hint="Optional."
            error={errors.subheadline}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Button label"
              name="ctaLabel"
              maxLength={24}
              defaultValue={banner?.ctaLabel ?? ''}
              placeholder="Shop now"
              hint="Optional."
              error={errors.ctaLabel}
            />
            <Input
              label="Links to"
              name="href"
              required
              maxLength={300}
              defaultValue={banner?.href}
              placeholder="/category/women"
              spellCheck={false}
              error={errors.href}
            />
          </div>
        </fieldset>
      </form>
    </DialogContent>
  );
}

/* ---------------------------------------------------------- row controls */

export function BannerToggle({
  bannerId,
  name,
  isActive,
}: {
  bannerId: string;
  name: string;
  isActive: boolean;
}) {
  const { pending, run } = useRun();

  return (
    <Button
      type="button"
      role="switch"
      aria-checked={isActive}
      aria-label={`${name}: ${isActive ? 'live' : 'hidden'}`}
      disabled={pending}
      onClick={() =>
        run(
          () => setBannerActive({ bannerId, isActive: !isActive }),
          isActive ? `${name} hidden from the homepage` : `${name} is live`,
        )
      }
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-2xs font-medium transition-colors disabled:opacity-50',
        isActive ? 'bg-success-50 text-success-700' : 'bg-sunken text-muted',
      )}
    >
      <span aria-hidden className={cn('size-1.5 rounded-full', isActive ? 'bg-success-500' : 'bg-line-bold')} />
      {isActive ? 'Live' : 'Hidden'}
    </Button>
  );
}

export function MoveBannerButtons({
  bannerId,
  name,
  first,
  last,
}: {
  bannerId: string;
  name: string;
  first: boolean;
  last: boolean;
}) {
  const { pending, run } = useRun();

  return (
    <div className="flex items-center">
      <Button
        type="button"
        size="xs"
        variant="ghost"
        aria-label={`Move ${name} earlier`}
        title="Earlier"
        disabled={pending || first}
        onClick={() => run(() => moveBanner({ bannerId, direction: 'up' }), `${name} moved earlier`)}
      >
        <ArrowUp className="size-3.5" aria-hidden />
      </Button>
      <Button
        type="button"
        size="xs"
        variant="ghost"
        aria-label={`Move ${name} later`}
        title="Later"
        disabled={pending || last}
        onClick={() => run(() => moveBanner({ bannerId, direction: 'down' }), `${name} moved later`)}
      >
        <ArrowDown className="size-3.5" aria-hidden />
      </Button>
    </div>
  );
}

export function DeleteBannerButton({ bannerId, name }: { bannerId: string; name: string }) {
  const [open, setOpen] = useState(false);
  const { pending, run } = useRun();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="xs" variant="ghost" className="text-danger-600 hover:text-danger-700">
          Delete
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`Delete ${name}?`}
        size="sm"
        footer={
          <>
            <DialogClose asChild>
              <Button type="button" variant="ghost" size="sm" disabled={pending}>
                Keep it
              </Button>
            </DialogClose>
            <Button
              type="button"
              variant="danger"
              size="sm"
              loading={pending}
              onClick={() => run(() => deleteBanner({ bannerId }), `${name} deleted`, () => setOpen(false))}
            >
              Delete banner
            </Button>
          </>
        }
      >
        <p className="text-muted text-sm">
          It comes off the homepage and out of this list for good. To take it down for a while
          instead, set it to Hidden.
        </p>
      </DialogContent>
    </Dialog>
  );
}

/** Copy the built-in hero slides into real banners, to edit like any other. */
export function AdoptDefaultSlidesButton() {
  const { pending, run } = useRun();

  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      loading={pending}
      onClick={() => run(() => adoptDefaultHeroSlides(), 'The five slides are yours to edit now')}
    >
      <Sparkles className="size-3.5" aria-hidden />
      Customise these slides
    </Button>
  );
}
