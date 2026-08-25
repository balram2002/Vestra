import { Landmark } from 'lucide-react';
import type { Metadata } from 'next';
import { Suspense } from 'react';

import { StatusBadge } from '@/components/ui/badge';
import { FINANCE } from '@/config/business';
import { SETTLEMENT_STATUS_META } from '@/domain/enums';
import { formatDate, formatMoney } from '@/lib/format';
import { requireSeller } from '@/server/auth/session';
import { listSellerSettlements, previewSettlement } from '@/server/services/settlements';

export const metadata: Metadata = { title: 'Settlements' };

/**
 * Payout statements.
 *
 * Every settlement itemises what it is made of, because sellers dispute
 * payouts and a total they cannot reconcile is what turns a payout into a
 * support ticket. The arithmetic is written out in full rather than summarised
 * into "net payable".
 */
export default function SellerSettlementsPage() {
  return (
    <>
      <h1 className="font-display text-ink text-xl">Settlements</h1>
      <p className="text-muted mt-1 text-sm">
        Money clears {FINANCE.settlementHoldDays} days after delivery, once the return window has
        closed on it.
      </p>

      <Suspense fallback={<div className="skeleton mt-6 h-96 rounded-lg" aria-hidden />}>
        <Settlements />
      </Suspense>
    </>
  );
}

async function Settlements() {
  const user = await requireSeller();
  const [settlements, next] = await Promise.all([
    listSellerSettlements(user.sellerId),
    previewSettlement(user.sellerId),
  ]);

  return (
    <div className="mt-6 space-y-6">
      {/*
        What the next run will pay. Shown even when it is nothing, because
        "when do I get paid" is the question this page exists to answer and an
        empty list answers it badly.
      */}
      <section className="border-accent-border bg-accent-soft rounded-lg border p-5">
        <div className="flex items-start gap-3">
          <Landmark className="text-accent mt-0.5 size-4 shrink-0" aria-hidden />
          <div className="min-w-0">
            <h2 className="text-ink text-md font-semibold">Next payout</h2>
            {next.ok && (next.netPayable ?? 0) > 0 ? (
              <p className="text-muted mt-1 text-sm">
                <span className="text-ink tabular font-semibold">
                  {formatMoney(next.netPayable ?? 0)}
                </span>{' '}
                across {next.orderCount} {next.orderCount === 1 ? 'order' : 'orders'} has cleared
                the hold and is waiting for the next run.
              </p>
            ) : (
              <p className="text-muted mt-1 text-sm">
                Nothing has cleared the {FINANCE.settlementHoldDays}-day hold yet. Delivered orders
                appear here once their return window closes.
              </p>
            )}
          </div>
        </div>
      </section>

      {settlements.length === 0 ? (
        <div className="border-line rounded-lg border border-dashed p-12 text-center">
          <p className="text-ink text-md font-medium">No settlements yet</p>
          <p className="text-muted mx-auto mt-1.5 max-w-sm text-sm">
            Your first statement appears after your first delivered order clears the hold period.
          </p>
        </div>
      ) : (
        <ul className="space-y-4">
          {settlements.map((settlement) => (
            <li key={settlement.id} className="border-line bg-raised rounded-lg border">
              <header className="border-line flex flex-wrap items-start justify-between gap-3 border-b p-5">
                <div>
                  <p className="text-ink tabular text-sm font-semibold">
                    {settlement.settlementNumber}
                  </p>
                  <p className="text-faint mt-0.5 text-2xs">
                    {formatDate(settlement.periodFrom)} – {formatDate(settlement.periodTo)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-ink tabular text-lg font-semibold">
                    {formatMoney(settlement.netPayable)}
                  </p>
                  <div className="mt-1 flex justify-end">
                    <StatusBadge meta={SETTLEMENT_STATUS_META[settlement.status]} size="sm" />
                  </div>
                </div>
              </header>

              {settlement.holdReason ? (
                <p className="border-warning-100 bg-warning-50 text-warning-700 border-b px-5 py-3 text-sm">
                  {settlement.holdReason}
                </p>
              ) : null}

              {/*
                The whole arithmetic, in the order it is applied. A seller
                should be able to check this against their own books without
                asking anybody.
              */}
              <dl className="p-5 text-sm">
                <Line label="Gross sales (delivered)" value={settlement.grossSales} />
                {settlement.returns > 0 ? (
                  <Line label="Returns refunded" value={-settlement.returns} />
                ) : null}
                <Line label="Net sales" value={settlement.netSales} emphasis />
                <Line label="Platform commission" value={-settlement.commission} />
                <Line label="Payment gateway fee" value={-settlement.paymentGatewayFee} />
                {settlement.reverseShippingCharges > 0 ? (
                  <Line
                    label="Reverse pickup (you were liable)"
                    value={-settlement.reverseShippingCharges}
                  />
                ) : null}
                {settlement.tcs > 0 ? <Line label="TCS" value={-settlement.tcs} /> : null}
                {settlement.tds > 0 ? <Line label="TDS (section 194-O)" value={-settlement.tds} /> : null}
                {settlement.otherAdjustments !== 0 ? (
                  <Line
                    label={settlement.adjustmentNote ?? 'Adjustment'}
                    value={settlement.otherAdjustments}
                  />
                ) : null}

                <div className="border-line mt-2 flex justify-between gap-3 border-t pt-2">
                  <dt className="text-ink font-semibold">Net payable</dt>
                  <dd className="text-ink tabular font-semibold">
                    {formatMoney(settlement.netPayable)}
                  </dd>
                </div>
              </dl>

              <footer className="border-line text-faint flex flex-wrap items-center justify-between gap-2 border-t px-5 py-3 text-2xs">
                <span>
                  {settlement.lines.length} {settlement.lines.length === 1 ? 'entry' : 'entries'}
                </span>
                {settlement.utr ? (
                  <span className="tabular">
                    Paid {settlement.paidAt ? formatDate(settlement.paidAt) : ''} · UTR{' '}
                    {settlement.utr}
                  </span>
                ) : null}
              </footer>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Line({
  label,
  value,
  emphasis,
}: {
  label: string;
  value: number;
  emphasis?: boolean;
}) {
  return (
    <div className="flex justify-between gap-3 py-1">
      <dt className={emphasis ? 'text-ink font-medium' : 'text-muted'}>{label}</dt>
      <dd
        className={
          value < 0
            ? 'text-danger-600 tabular'
            : emphasis
              ? 'text-ink tabular font-medium'
              : 'text-ink tabular'
        }
      >
        {value < 0 ? `− ${formatMoney(Math.abs(value))}` : formatMoney(value)}
      </dd>
    </div>
  );
}
