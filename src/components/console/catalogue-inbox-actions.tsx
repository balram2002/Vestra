'use client';

import { Archive, Check, EyeOff } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { decideNewBrand, decideNewCategory, decideNewProduct } from '@/server/actions/catalog';

/**
 * Deciding on what a seller published.
 *
 * KEEP IS THE PRIMARY ACTION, and it is deliberately the plainest one: the
 * listing is already in the shop and most of them are fine. What the button
 * does is record that a person looked, which is what takes the row out of the
 * inbox -- without it the same listings are read forever.
 *
 * Taking something down asks for a reason and will not proceed without one.
 * The seller reads it, and a listing that vanishes with no explanation becomes
 * a support ticket that costs more than the sentence would have.
 */

function useDecision() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<{ ok: boolean; error?: string }>, done: string, after?: () => void) => {
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        toast.error(result.error ?? 'That did not go through.');
        return;
      }
      toast.success(done);
      after?.();
      router.refresh();
    });
  };

  return { pending, run };
}

export function ProductDecision({ productId, title }: { productId: string; title: string }) {
  const { pending, run } = useDecision();

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <Button
        type="button"
        size="xs"
        variant="secondary"
        disabled={pending}
        onClick={() => run(() => decideNewProduct({ productId, decision: 'KEEP' }), 'Marked as checked')}
      >
        <Check className="size-3.5" aria-hidden />
        Keep
      </Button>

      <ReasonDialog
        trigger={
          <Button type="button" size="xs" variant="ghost" disabled={pending}>
            <EyeOff className="size-3.5" aria-hidden />
            Take down
          </Button>
        }
        title="Take this listing down"
        description={`"${title}" comes out of the shop. The seller is told why and can fix it.`}
        confirmLabel="Take down"
        onConfirm={(reason, close) =>
          run(
            () => decideNewProduct({ productId, decision: 'UNPUBLISH', reason }),
            'Taken down',
            close,
          )
        }
        pending={pending}
      />

      <ReasonDialog
        trigger={
          <Button type="button" size="xs" variant="ghost" disabled={pending}>
            <Archive className="size-3.5" aria-hidden />
            Archive
          </Button>
        }
        title="Archive this listing"
        description="For something that should not come back: counterfeit, prohibited, or a duplicate."
        confirmLabel="Archive"
        onConfirm={(reason, close) =>
          run(() => decideNewProduct({ productId, decision: 'ARCHIVE', reason }), 'Archived', close)
        }
        pending={pending}
      />
    </div>
  );
}

export function ItemDecision({
  kind,
  id,
  name,
}: {
  kind: 'brand' | 'category';
  id: string;
  name: string;
}) {
  const { pending, run } = useDecision();

  const keep = () =>
    kind === 'brand'
      ? decideNewBrand({ brandId: id, decision: 'KEEP' })
      : decideNewCategory({ categoryId: id, decision: 'KEEP' });

  const hide = () =>
    kind === 'brand'
      ? decideNewBrand({ brandId: id, decision: 'HIDE' })
      : decideNewCategory({ categoryId: id, decision: 'HIDE' });

  return (
    <div className="flex items-center gap-1.5">
      <Button
        type="button"
        size="xs"
        variant="secondary"
        disabled={pending}
        onClick={() => run(keep, `${name} kept`)}
      >
        <Check className="size-3.5" aria-hidden />
        Keep
      </Button>
      <Button
        type="button"
        size="xs"
        variant="ghost"
        disabled={pending}
        onClick={() => run(hide, `${name} hidden`)}
      >
        <EyeOff className="size-3.5" aria-hidden />
        Hide
      </Button>
    </div>
  );
}

function ReasonDialog({
  trigger,
  title,
  description,
  confirmLabel,
  onConfirm,
  pending,
}: {
  trigger: React.ReactNode;
  title: string;
  description: string;
  confirmLabel: string;
  onConfirm: (reason: string, close: () => void) => void;
  pending: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent title={title} description={description}>
        <Textarea
          label="Reason"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={3}
          maxLength={400}
          placeholder="The seller reads this. Say what to change."
          hint="At least a sentence."
        />
        <div className="mt-4 flex justify-end gap-2">
          <DialogClose asChild>
            <Button type="button" variant="ghost" size="sm" disabled={pending}>
              Cancel
            </Button>
          </DialogClose>
          <Button
            type="button"
            variant="danger"
            size="sm"
            disabled={pending || reason.trim().length < 8}
            onClick={() => onConfirm(reason.trim(), () => setOpen(false))}
          >
            {pending ? 'Working…' : confirmLabel}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
