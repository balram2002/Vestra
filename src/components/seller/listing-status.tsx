'use client';

import { AlertTriangle, Copy, Eye, EyeOff, Send } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { PRODUCT_STATUS_META, type ProductStatus } from '@/domain/enums';
import type { Blocker } from '@/lib/validation/product';
import {
  archiveListing,
  duplicateListing,
  setListingPublished,
  submitListing,
} from '@/server/actions/authoring';

/**
 * What the seller can do with this listing right now.
 *
 * The actions are derived from status, so the panel never offers a move the
 * server would refuse. Blockers are shown INLINE rather than only as a toast on
 * failure: a seller should be able to see what is missing before they press
 * submit, not learn it afterwards.
 */
export function ListingStatus({
  productId,
  status,
  blockers,
  rejectionReason,
}: {
  productId: string;
  status: ProductStatus;
  blockers: Blocker[];
  rejectionReason: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [shown, setShown] = useState(false);

  const meta = PRODUCT_STATUS_META[status];
  const ready = blockers.length === 0;

  const canSubmit = ['DRAFT', 'REJECTED', 'UNPUBLISHED'].includes(status);
  const canUnpublish = status === 'PUBLISHED';
  const canPublish = status === 'APPROVED' || status === 'UNPUBLISHED';
  const canArchive = status !== 'ARCHIVED';

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, success: string) => {
    startTransition(async () => {
      const result = await fn();
      if (result.ok) {
        toast.success(success);
        router.refresh();
      } else {
        toast.error(result.error ?? 'That did not work.');
      }
    });
  };

  return (
    <section className="border-line bg-raised rounded-lg border p-5">
      <header className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-ink text-md font-semibold">{meta.label}</h2>
          <p className="text-muted mt-0.5 text-sm">{meta.description}</p>
        </div>
      </header>

      {rejectionReason ? (
        <div className="border-danger-100 bg-danger-50 mt-3 rounded-md border p-3">
          <p className="text-danger-700 text-xs font-medium">Why it was not approved</p>
          <p className="text-danger-700/90 mt-0.5 text-sm">{rejectionReason}</p>
        </div>
      ) : null}

      {/*
        Only worth showing where the seller can act on it. On a listing already
        in review, a blocker list is noise.
      */}
      {canSubmit && !ready ? (
        <div className="border-warning-100 bg-warning-50 mt-3 rounded-md border p-3">
          <button
            type="button"
            onClick={() => setShown((open) => !open)}
            aria-expanded={shown}
            className="text-warning-700 flex w-full items-center gap-2 text-left text-xs font-medium"
          >
            <AlertTriangle className="size-3.5 shrink-0" aria-hidden />
            {blockers.length} {blockers.length === 1 ? 'thing' : 'things'} to finish before review
            <span className="ml-auto text-2xs">{shown ? 'Hide' : 'Show'}</span>
          </button>

          {shown ? (
            <ul className="text-warning-700/90 mt-2 space-y-1 text-sm">
              {blockers.map((blocker) => (
                <li key={`${blocker.field}-${blocker.message}`} className="flex gap-2">
                  <span aria-hidden>·</span>
                  {blocker.message}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        {canSubmit ? (
          <button
            type="button"
            disabled={pending || !ready}
            onClick={() => run(() => submitListing({ productId }), 'Submitted for review')}
            className="bg-ink text-canvas disabled:bg-line-strong inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium disabled:cursor-not-allowed"
          >
            <Send className="size-3.5" aria-hidden />
            {pending ? 'Working…' : 'Submit for review'}
          </button>
        ) : null}

        {canPublish ? (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(() => setListingPublished({ productId, published: true }), 'Listing is live')
            }
            className="bg-ink text-canvas inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-xs font-medium disabled:opacity-50"
          >
            <Eye className="size-3.5" aria-hidden />
            Put live
          </button>
        ) : null}

        {canUnpublish ? (
          <button
            type="button"
            disabled={pending}
            onClick={() =>
              run(
                () => setListingPublished({ productId, published: false }),
                'Taken down. It keeps its reviews and can go back up any time.',
              )
            }
            className="border-line-strong text-muted hover:border-ink hover:text-ink inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs transition-colors"
          >
            <EyeOff className="size-3.5" aria-hidden />
            Take down
          </button>
        ) : null}

        <button
          type="button"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await duplicateListing({ productId });
              if (result.ok && result.productId) {
                toast.success('Copied into a new draft');
                router.push(`/seller/products/${result.productId}`);
              } else {
                toast.error(result.error ?? 'That did not work.');
              }
            })
          }
          className="border-line-strong text-muted hover:border-ink hover:text-ink inline-flex items-center gap-1.5 rounded-md border px-3 py-2 text-xs transition-colors"
        >
          <Copy className="size-3.5" aria-hidden />
          Duplicate
        </button>

        {canArchive ? (
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => archiveListing({ productId }), 'Archived')}
            className="text-faint hover:text-danger-600 ml-auto rounded-md px-2 py-2 text-xs transition-colors"
          >
            Archive
          </button>
        ) : null}
      </div>
    </section>
  );
}
