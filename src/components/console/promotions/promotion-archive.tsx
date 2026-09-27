'use client';

import { Archive, ArchiveRestore } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { setPromotionArchived } from '@/server/actions/promotions';

/** Archive or restore one promotion, asking first for the one that switches it off. */
export function PromotionArchive({ promotionId, title, archived }: { promotionId: string; title: string; archived: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const run = (next: boolean) =>
    startTransition(async () => {
      const result = await setPromotionArchived({ promotionId, archived: next });
      if (!result.ok) {
        toast.error(result.error ?? 'That did not work.');
        return;
      }
      toast.success(next ? `${title} archived` : `${title} restored — switch it on when it should work again`);
      router.refresh();
    });

  if (archived) {
    return (
      <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => run(false)}>
        <ArchiveRestore className="size-4" aria-hidden />
        Restore
      </Button>
    );
  }

  return (
    <ConfirmDialog
      trigger={
        <Button type="button" size="sm" variant="ghost" disabled={pending}>
          <Archive className="size-4" aria-hidden />
          Archive
        </Button>
      }
      title={`Archive “${title}”?`}
      description="It stops applying straight away and leaves the list and calendar. Its orders are kept, and it can be restored."
      confirmLabel="Archive"
      tone="danger"
      onConfirm={() => run(true)}
    />
  );
}
