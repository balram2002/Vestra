'use client';

import { RotateCcw } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { resetBannerPlacement } from '@/server/actions/admin';

/**
 * Reset the hero slides, or the tile grid.
 *
 * It HIDES rather than deletes, like every reset on these screens: the hero
 * falls back to the built-in slides a new shop starts with, the grid steps out
 * of the page, and every banner stays in the list below, one click from live.
 *
 * Typed confirmation, because it takes a whole row of the homepage down at
 * once -- and there is nothing to reset while nothing is live, so the button
 * says so rather than offering an action that would do nothing.
 */
export function ResetPlacementButton({
  placement,
  liveCount,
}: {
  placement: 'HOME_HERO' | 'HOME_GRID';
  liveCount: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const hero = placement === 'HOME_HERO';

  return (
    <ConfirmDialog
      trigger={
        <Button
          type="button"
          size="sm"
          variant="ghost"
          disabled={pending || liveCount === 0}
          title={liveCount === 0 ? 'Nothing is live here, so there is nothing to reset' : undefined}
        >
          <RotateCcw className="size-4" aria-hidden />
          Reset
        </Button>
      }
      title={hero ? 'Reset the hero slides?' : 'Reset the tile grid?'}
      description={
        hero
          ? 'Every slide of yours is hidden, and the homepage goes back to its built-in slides. Nothing is deleted: each slide can be made live again.'
          : 'Every tile is hidden, so the grid steps out of the homepage, as it does on a new shop. Nothing is deleted.'
      }
      confirmLabel="Reset"
      tone="danger"
      requireText="RESET"
      onConfirm={() =>
        startTransition(async () => {
          const result = await resetBannerPlacement({ placement });
          if (!result.ok) {
            toast.error(result.error ?? 'That did not reset.');
            return;
          }
          toast.success(hero ? 'Back to the built-in slides' : 'The tile grid is reset');
          router.refresh();
        })
      }
    />
  );
}
