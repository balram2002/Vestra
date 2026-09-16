'use client';

import { Star, Trash2 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import Image from 'next/image';
import { useTransition } from 'react';
import { toast } from 'sonner';

import { FileUpload } from '@/components/ui/file-upload';
import type { Media } from '@/domain/types';
import { formatFileSize } from '@/lib/format';
import { mediaLimits } from '@/lib/validation/product';
import {
  attachUploadedMedia,
  deleteListingMedia,
  makeListingMediaPrimary,
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
 *
 * The uploading itself is `<FileUpload>`, shared with onboarding — a seller who
 * has learned how photographs work should not have to learn again for their GST
 * certificate. Photographs are the slowest upload in the app, which is why it
 * reports a real rate and a real time remaining rather than a spinner.
 */
export function MediaManager({ productId, media }: { productId: string; media: Media[] }) {
  const [pending, startTransition] = useTransition();

  const images = media.filter((asset) => asset.kind === 'IMAGE');
  const remaining = Math.max(0, mediaLimits.maxImages - images.length);

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) => {
    startTransition(async () => {
      const result = await fn();
      if (result.ok) toast.success(success);
      else toast.error(result.error ?? 'That did not work.');
    });
  };

  return (
    <Card as="section">
      <header className="mb-4">
        <h2 className="text-ink text-md font-semibold">Photography</h2>
        <p className="text-muted mt-0.5 text-sm">
          The first photo leads everywhere this style appears. Up to {mediaLimits.maxImages}.
        </p>
      </header>

      {images.length > 0 ? (
        <ul className="mb-4 grid grid-cols-3 gap-3 sm:grid-cols-4">
          {images.map((asset, index) => (
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

      <FileUpload
        purpose="listing"
        multiple
        remaining={remaining}
        maxBytes={mediaLimits.maxImageBytes}
        accept={mediaLimits.acceptedImageTypes.join(',')}
        label="Drop photos here, or browse"
        hint={`JPEG, PNG, WebP or AVIF · up to ${formatFileSize(mediaLimits.maxImageBytes)} each · portrait crops look best`}
        onUploaded={(file) => {
          startTransition(async () => {
            const result = await attachUploadedMedia({ productId, url: file.url });
            if (result.ok) toast.success('Photo added');
            else toast.error(result.error ?? 'That photo could not be attached.');
          });
        }}
      />

    </Card>
  );
}
