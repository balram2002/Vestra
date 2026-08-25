'use client';

import { ImagePlus, Star, Trash2 } from 'lucide-react';
import Image from 'next/image';
import { useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

import type { Media } from '@/domain/types';
import { formatFileSize } from '@/lib/format';
import { mediaLimits } from '@/lib/validation/product';
import {
  deleteListingMedia,
  makeListingMediaPrimary,
  uploadListingMedia,
} from '@/server/actions/authoring';

/**
 * Product photography.
 *
 * The first image is the one shoppers see in every grid, so promoting an asset
 * to primary is a first-class action rather than a drag-and-drop gesture that
 * has to be discovered — and it is a single click, because on a listing with
 * eight photos the seller usually knows exactly which one should lead.
 *
 * Client-side size and count checks are a COURTESY that saves an upload; the
 * store re-checks everything, and it checks the bytes rather than the name.
 */
export function MediaManager({ productId, media }: { productId: string; media: Media[] }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [dragging, setDragging] = useState(false);

  const images = media.filter((asset) => asset.kind === 'IMAGE');
  const full = images.length >= mediaLimits.maxImages;

  const upload = (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const chosen = Array.from(files);
    const room = mediaLimits.maxImages - images.length;
    if (chosen.length > room) {
      toast.error(`Room for ${room} more ${room === 1 ? 'photo' : 'photos'}.`);
      return;
    }

    const tooBig = chosen.find((file) => file.size > mediaLimits.maxImageBytes);
    if (tooBig) {
      toast.error(
        `${tooBig.name} is ${formatFileSize(tooBig.size)}. The limit is ${formatFileSize(mediaLimits.maxImageBytes)}.`,
      );
      return;
    }

    const formData = new FormData();
    formData.set('productId', productId);
    for (const file of chosen) formData.append('files', file);

    startTransition(async () => {
      const result = await uploadListingMedia(formData);
      if (result.ok) toast.success(chosen.length === 1 ? 'Photo added' : `${chosen.length} photos added`);
      else toast.error(result.error ?? 'That upload did not work.');
      if (inputRef.current) inputRef.current.value = '';
    });
  };

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) => {
    startTransition(async () => {
      const result = await fn();
      if (result.ok) toast.success(success);
      else toast.error(result.error ?? 'That did not work.');
    });
  };

  return (
    <section className="border-line bg-raised rounded-lg border p-5">
      <header className="mb-4">
        <h2 className="text-ink text-md font-semibold">Photography</h2>
        <p className="text-muted mt-0.5 text-sm">
          The first photo leads everywhere this style appears. Up to {mediaLimits.maxImages}.
        </p>
      </header>

      {media.length > 0 ? (
        <ul className="mb-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
          {media.map((asset, index) => (
            <li key={asset.id} className="group relative">
              <div className="bg-sunken relative aspect-3/4 overflow-hidden rounded-md">
                <Image
                  src={asset.url}
                  alt={asset.alt}
                  fill
                  sizes="(min-width: 640px) 20vw, 30vw"
                  className="object-cover"
                />
                {index === 0 ? (
                  <span className="bg-ink text-canvas absolute left-1.5 top-1.5 rounded-sm px-1.5 py-0.5 text-2xs font-medium">
                    Primary
                  </span>
                ) : null}
              </div>

              <div className="mt-1.5 flex items-center justify-between gap-1">
                {index !== 0 ? (
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      run(
                        () => makeListingMediaPrimary({ productId, mediaId: asset.id }),
                        'Primary photo updated',
                      )
                    }
                    className="text-muted hover:text-ink inline-flex items-center gap-1 text-2xs transition-colors"
                  >
                    <Star className="size-3" aria-hidden />
                    Make primary
                  </button>
                ) : (
                  <span className="text-faint text-2xs">Shown first</span>
                )}

                <button
                  type="button"
                  disabled={pending}
                  onClick={() =>
                    run(() => deleteListingMedia({ productId, mediaId: asset.id }), 'Photo removed')
                  }
                  aria-label="Remove photo"
                  className="text-faint hover:text-danger-600 transition-colors"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {/*
        A drop zone AND a button. Dropping is faster for anyone who has the
        folder open; the button is the one that works with a keyboard.
      */}
      <div
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          if (!full) upload(event.dataTransfer.files);
        }}
        className={
          dragging
            ? 'border-accent bg-accent-soft rounded-md border-2 border-dashed p-6 text-center'
            : 'border-line rounded-md border-2 border-dashed p-6 text-center'
        }
      >
        <ImagePlus className="text-faint mx-auto size-6" aria-hidden strokeWidth={1.5} />
        <p className="text-muted mt-2 text-sm">
          {full ? 'You have reached the photo limit.' : 'Drop photos here, or'}
        </p>

        {!full ? (
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={pending}
            className="border-line-strong text-ink hover:border-ink mt-2 rounded-sm border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-wait"
          >
            {pending ? 'Uploading…' : 'Choose files'}
          </button>
        ) : null}

        <p className="text-faint mt-2 text-2xs">
          JPEG, PNG, WebP or AVIF · up to {formatFileSize(mediaLimits.maxImageBytes)} each · portrait
          crops look best
        </p>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept={mediaLimits.acceptedImageTypes.join(',')}
          onChange={(event) => upload(event.target.files)}
          className="sr-only"
        />
      </div>
    </section>
  );
}
