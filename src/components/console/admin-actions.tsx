'use client';

import { useState, useTransition } from 'react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogClose, DialogContent, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

import { cn } from '@/lib/cn';
import {
  reviewProduct,
  setCategoryActive,
  setCouponActive,
  setPromotionActive,
  setSectionActive,
  setSellerStatus,
  setUserStatus,
} from '@/server/actions/admin';
import { moderateReview } from '@/server/actions/reviews';

/**
 * Admin write actions.
 *
 * Deliberately small, single-purpose controls placed in the row they act on,
 * rather than a bulk toolbar. Every one of these is logged and most notify the
 * affected party, so they are worth one deliberate click each — a multi-select
 * plus "apply to 40 rows" makes a mistake forty times.
 *
 * Destructive or contested decisions (reject, suspend) collect a reason before
 * they fire, because that text is what the seller reads.
 */

function useAction() {
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

/* --------------------------------------------------------- product review */

export function ProductReviewActions({
  productId,
  title,
}: {
  productId: string;
  title: string;
}) {
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const { pending, run } = useAction();

  if (rejecting) {
    return (
      <div className="w-56">
        <Textarea
          label="Reason"
          hideLabel
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={2}
          maxLength={400}
          placeholder="Why? The seller reads this."
          className="text-xs"
        />
        <div className="mt-1.5 flex gap-1.5">
          <Button
            type="button"
            disabled={pending || reason.trim().length < 8}
            onClick={() =>
              run(
                () => reviewProduct({ productId, decision: 'REJECT', reason: reason.trim() }),
                `"${title}" rejected`,
                () => setRejecting(false),
              )
            }
            variant="danger"
          size="xs"
          >
            Confirm
          </Button>
          <Button
            type="button"
            onClick={() => setRejecting(false)}
            disabled={pending}
            variant="ghost"
          size="xs"
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 gap-1.5">
      <Button
        type="button"
        disabled={pending}
        onClick={() =>
          run(() => reviewProduct({ productId, decision: 'APPROVE' }), `"${title}" is live`)
        }
        size="xs"
        loading={pending}
      >
        Approve
      </Button>
      <Button
        type="button"
        disabled={pending}
        onClick={() => setRejecting(true)}
        variant="secondary"
        size="xs"
      >
        Reject
      </Button>
    </div>
  );
}

/* ---------------------------------------------------------- seller status */

export function SellerStatusActions({
  sellerId,
  name,
  status,
}: {
  sellerId: string;
  name: string;
  status: string;
}) {
  const [suspending, setSuspending] = useState(false);
  const [reason, setReason] = useState('');
  const { pending, run } = useAction();

  const suspended = status === 'SUSPENDED' || status === 'ON_HOLD';

  if (suspending) {
    return (
      <div className="w-56">
        <Textarea
          label="Reason"
          hideLabel
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={2}
          maxLength={400}
          placeholder="Reason. This takes a business offline."
          className="text-xs"
        />
        <div className="mt-1.5 flex gap-1.5">
          <Button
            type="button"
            disabled={pending || reason.trim().length < 8}
            onClick={() =>
              run(
                () => setSellerStatus({ sellerId, status: 'SUSPENDED', reason: reason.trim() }),
                `${name} suspended`,
                () => setSuspending(false),
              )
            }
            variant="danger"
          size="xs"
          >
            Suspend
          </Button>
          <Button
            type="button"
            onClick={() => setSuspending(false)}
            disabled={pending}
            variant="ghost"
          size="xs"
          >
            Cancel
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 gap-1.5">
      {suspended ? (
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            run(() => setSellerStatus({ sellerId, status: 'ACTIVE' }), `${name} reinstated`)
          }
          size="xs"
        >
          Reinstate
        </Button>
      ) : (
        <Button
          type="button"
          disabled={pending}
          onClick={() => setSuspending(true)}
          variant="secondary"
          size="xs"
        >
          Suspend
        </Button>
      )}
    </div>
  );
}

/* ------------------------------------------------------------- toggles */

export function CouponToggle({
  couponId,
  code,
  isActive,
}: {
  couponId: string;
  code: string;
  isActive: boolean;
}) {
  const { pending, run } = useAction();

  return (
    <Toggle
      pending={pending}
      on={isActive}
      onLabel="Enabled"
      offLabel="Disabled"
      onClick={() =>
        run(
          () => setCouponActive({ couponId, isActive: !isActive }),
          isActive ? `${code} disabled` : `${code} enabled`,
        )
      }
    />
  );
}

export function SectionToggle({
  sectionId,
  label,
  isActive,
}: {
  sectionId: string;
  label: string;
  isActive: boolean;
}) {
  const { pending, run } = useAction();

  return (
    <Toggle
      pending={pending}
      on={isActive}
      onLabel="Live"
      offLabel="Hidden"
      onClick={() =>
        run(
          () => setSectionActive({ sectionId, isActive: !isActive }),
          isActive ? `${label} hidden from the homepage` : `${label} is live`,
        )
      }
    />
  );
}

function Toggle({
  pending,
  on,
  onLabel,
  offLabel,
  onClick,
}: {
  pending: boolean;
  on: boolean;
  onLabel: string;
  offLabel: string;
  onClick: () => void;
}) {
  return (
    <Button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={pending}
      onClick={onClick}
      className={cn(
        'inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-2xs font-medium transition-colors disabled:opacity-50',
        on ? 'bg-success-50 text-success-700' : 'bg-sunken text-muted',
      )}
    >
      <span
        aria-hidden
        className={cn('size-1.5 rounded-full', on ? 'bg-success-500' : 'bg-line-bold')}
      />
      {on ? onLabel : offLabel}
    </Button>
  );
}

export function PromotionToggle({
  promotionId,
  title,
  isActive,
}: {
  promotionId: string;
  title: string;
  isActive: boolean;
}) {
  const { pending, run } = useAction();

  return (
    <Toggle
      pending={pending}
      on={isActive}
      onLabel="Live"
      offLabel="Paused"
      onClick={() =>
        run(
          () => setPromotionActive({ promotionId, isActive: !isActive }),
          isActive ? `${title} paused` : `${title} is live`,
        )
      }
    />
  );
}

/* ------------------------------------------------------------ user status */

/**
 * Suspend or reactivate a person.
 *
 * Suspension is enforced where the session is read, not here: a suspended
 * account resolves to no user on its very next request, so it is signed out on
 * every device at once without any session list to hunt through.
 *
 * The reason goes to a dialog rather than an inline textarea. This control
 * sits in a dense directory table, and a row that grows a form in place
 * shoves every row below it down under the pointer.
 */
export function UserStatusActions({
  userId,
  name,
  status,
}: {
  userId: string;
  name: string;
  status: string;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const { pending, run } = useAction();

  if (status === 'SUSPENDED') {
    return (
      <Button
        type="button"
        size="xs"
        variant="secondary"
        loading={pending}
        onClick={() => run(() => setUserStatus({ userId, status: 'ACTIVE' }), `${name} reactivated`)}
      >
        Reactivate
      </Button>
    );
  }

  const close = () => {
    setOpen(false);
    setReason('');
  };

  return (
    <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <DialogTrigger asChild>
        <Button type="button" size="xs" variant="ghost" className="text-danger-600 hover:text-danger-700">
          Suspend
        </Button>
      </DialogTrigger>
      <DialogContent
        title={`Suspend ${name}?`}
        description="They are signed out everywhere on their next request and cannot sign in until an admin reactivates them. Orders already placed carry on."
      >
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            run(
              () => setUserStatus({ userId, status: 'SUSPENDED', reason: reason.trim() }),
              `${name} suspended`,
              close,
            );
          }}
        >
          <Textarea
            label="Reason"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            rows={3}
            maxLength={400}
            placeholder="Recorded in the audit log with your name."
            hint="At least 8 characters."
            required
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={close} disabled={pending}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="danger"
              size="sm"
              loading={pending}
              disabled={reason.trim().length < 8}
            >
              Suspend account
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
/* --------------------------------------------------------------- category */

export function CategoryToggle({
  categoryId,
  name,
  isActive,
}: {
  categoryId: string;
  name: string;
  isActive: boolean;
}) {
  const { pending, run } = useAction();

  return (
    <Toggle
      pending={pending}
      on={isActive}
      onLabel="Visible"
      offLabel="Hidden"
      onClick={() =>
        run(
          () => setCategoryActive({ categoryId, isActive: !isActive }),
          isActive ? `${name} hidden from the shop` : `${name} is back in the shop`,
        )
      }
    />
  );
}

/* ---------------------------------------------------------------- reviews */

/**
 * Publish, reject or take down one review.
 *
 * Rejecting asks for a reason in a dialog rather than a textarea in the row,
 * for the same reason as suspension: a row that grows a form shoves every row
 * below it under the pointer.
 */
export function ReviewModerationActions({
  reviewId,
  status,
}: {
  reviewId: string;
  status: string;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const { pending, run } = useAction();
  const live = status === 'PUBLISHED';

  const close = () => {
    setOpen(false);
    setNote('');
  };

  return (
    <div className="flex shrink-0 gap-1.5">
      {live ? null : (
        <Button
          type="button"
          size="xs"
          loading={pending}
          onClick={() => run(() => moderateReview({ reviewId, decision: 'PUBLISH' }), 'Review published')}
        >
          Publish
        </Button>
      )}

      {status === 'REJECTED' ? null : (
        <Dialog open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
          <DialogTrigger asChild>
            <Button
              type="button"
              size="xs"
              variant="ghost"
              className="text-danger-600 hover:text-danger-700"
            >
              {live ? 'Take down' : 'Reject'}
            </Button>
          </DialogTrigger>
          <DialogContent
            title={live ? 'Take this review down?' : 'Reject this review?'}
            description={
              live
                ? 'It stops showing on the product page and no longer counts towards its rating.'
                : 'It will not be published. The reason stays in the audit log.'
            }
            footer={
              <>
                <DialogClose asChild>
                  <Button variant="ghost" size="sm" disabled={pending}>
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  variant="danger"
                  size="sm"
                  loading={pending}
                  disabled={note.trim().length < 4}
                  onClick={() =>
                    run(
                      () => moderateReview({ reviewId, decision: 'REJECT', note: note.trim() }),
                      live ? 'Review taken down' : 'Review rejected',
                      close,
                    )
                  }
                >
                  {live ? 'Take down' : 'Reject'}
                </Button>
              </>
            }
          >
            <Textarea
              label="Reason"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              rows={3}
              maxLength={300}
              placeholder="Recorded in the audit log with your name."
              hint="At least 4 characters."
            />
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
