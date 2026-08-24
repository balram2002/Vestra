'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { cn } from '@/lib/cn';
import {
  reviewProduct,
  setCouponActive,
  setSectionActive,
  setSellerStatus,
} from '@/server/actions/admin';

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
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={2}
          maxLength={400}
          placeholder="Why? The seller reads this."
          className="border-line-strong bg-canvas text-ink placeholder:text-faint w-full rounded-sm border px-2 py-1.5 text-2xs"
        />
        <div className="mt-1.5 flex gap-1.5">
          <button
            type="button"
            disabled={pending || reason.trim().length < 8}
            onClick={() =>
              run(
                () => reviewProduct({ productId, decision: 'REJECT', reason: reason.trim() }),
                `"${title}" rejected`,
                () => setRejecting(false),
              )
            }
            className="bg-danger-600 disabled:bg-line-strong rounded-sm px-2 py-1 text-2xs font-medium text-white disabled:cursor-not-allowed"
          >
            Confirm
          </button>
          <button
            type="button"
            onClick={() => setRejecting(false)}
            disabled={pending}
            className="text-muted hover:text-ink px-1.5 py-1 text-2xs"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 gap-1.5">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          run(() => reviewProduct({ productId, decision: 'APPROVE' }), `"${title}" is live`)
        }
        className="bg-ink text-canvas rounded-sm px-2.5 py-1 text-2xs font-medium disabled:opacity-50"
      >
        {pending ? '…' : 'Approve'}
      </button>
      <button
        type="button"
        disabled={pending}
        onClick={() => setRejecting(true)}
        className="border-line-strong text-muted hover:border-ink hover:text-ink rounded-sm border px-2.5 py-1 text-2xs transition-colors"
      >
        Reject
      </button>
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
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          rows={2}
          maxLength={400}
          placeholder="Reason. This takes a business offline."
          className="border-line-strong bg-canvas text-ink placeholder:text-faint w-full rounded-sm border px-2 py-1.5 text-2xs"
        />
        <div className="mt-1.5 flex gap-1.5">
          <button
            type="button"
            disabled={pending || reason.trim().length < 8}
            onClick={() =>
              run(
                () => setSellerStatus({ sellerId, status: 'SUSPENDED', reason: reason.trim() }),
                `${name} suspended`,
                () => setSuspending(false),
              )
            }
            className="bg-danger-600 disabled:bg-line-strong rounded-sm px-2 py-1 text-2xs font-medium text-white disabled:cursor-not-allowed"
          >
            Suspend
          </button>
          <button
            type="button"
            onClick={() => setSuspending(false)}
            disabled={pending}
            className="text-muted hover:text-ink px-1.5 py-1 text-2xs"
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex shrink-0 gap-1.5">
      {suspended ? (
        <button
          type="button"
          disabled={pending}
          onClick={() =>
            run(() => setSellerStatus({ sellerId, status: 'ACTIVE' }), `${name} reinstated`)
          }
          className="bg-ink text-canvas rounded-sm px-2.5 py-1 text-2xs font-medium disabled:opacity-50"
        >
          {pending ? '…' : 'Reinstate'}
        </button>
      ) : (
        <button
          type="button"
          disabled={pending}
          onClick={() => setSuspending(true)}
          className="border-line-strong text-muted hover:border-danger-600 hover:text-danger-600 rounded-sm border px-2.5 py-1 text-2xs transition-colors"
        >
          Suspend
        </button>
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
    <button
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
      {pending ? '…' : on ? onLabel : offLabel}
    </button>
  );
}
