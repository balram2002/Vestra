'use client';

import { FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTransition } from 'react';
import { toast } from 'sonner';

import { closeManifest } from '@/server/actions/seller';

/**
 * Close the day's handover sheet.
 *
 * A manifest is one document the courier signs for the whole run, instead of
 * scanning every parcel at the door. It only appears when there is actually
 * something to manifest, so it is a prompt to finish the run rather than a
 * permanent control the seller learns to ignore.
 */
export function ManifestBar({
  shipmentIds,
  carrier,
}: {
  shipmentIds: string[];
  carrier: string | null;
}) {
  const [pending, startTransition] = useTransition();

  const run = () => {
    startTransition(async () => {
      const result = await closeManifest({ shipmentIds });
      if (result.ok) toast.success(`Manifest closed for ${shipmentIds.length} parcels`);
      else toast.error(result.error ?? 'Could not close the manifest.');
    });
  };

  return (
    <div className="border-accent-border bg-accent-soft mt-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
      <div className="flex items-start gap-2.5">
        <FileText className="text-accent mt-0.5 size-4 shrink-0" aria-hidden />
        <div>
          <p className="text-ink text-sm font-medium">
            {shipmentIds.length} {shipmentIds.length === 1 ? 'parcel is' : 'parcels are'} ready for
            handover
          </p>
          <p className="text-muted mt-0.5 text-xs">
            Close a manifest so {carrier ?? 'the courier'} signs once for the whole run.
          </p>
        </div>
      </div>

      <Button
        type="button"
        onClick={run}
        disabled={pending}
        size="sm"
        className="shrink-0"
      >
        Close manifest
      </Button>
    </div>
  );
}
