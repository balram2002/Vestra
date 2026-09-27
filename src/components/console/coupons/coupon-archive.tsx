'use client';

import { Archive, ArchiveRestore } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { setCouponArchived } from '@/server/actions/coupons';

/** Archive or restore one coupon, asking first for the one that switches it off. */
export function CouponArchive({ couponId, code, archived }: { couponId: string; code: string; archived: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const run = (next: boolean) =>
    startTransition(async () => {
      const result = await setCouponArchived({ couponId, archived: next });
      if (!result.ok) {
        toast.error(result.error ?? 'That did not work.');
        return;
      }
      toast.success(next ? `${code} archived` : `${code} restored — switch it on when it should work again`);
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
      title={`Archive ${code}?`}
      description="It stops working straight away and leaves the coupon list. Its orders and numbers are kept, and it can be restored."
      confirmLabel="Archive"
      tone="danger"
      onConfirm={() => run(true)}
    />
  );
}
