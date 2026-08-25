import type { Metadata } from 'next';
import { Suspense } from 'react';

import { RunSettlement } from '@/components/console/run-settlement';
import { SettlementActions } from '@/components/console/settlement-actions';
import { StatusBadge } from '@/components/ui/badge';
import { FINANCE } from '@/config/business';
import { SETTLEMENT_STATUS_META } from '@/domain/enums';
import { formatDate, formatMoney } from '@/lib/format';
import { requirePermission } from '@/server/auth/session';
import { collections, toEntities } from '@/server/db/collections';
import { listAllSettlements } from '@/server/services/settlements';

export const metadata: Metadata = { title: 'Settlements' };

/**
 * Seller payouts.
 *
 * Two halves, because finance does two different jobs here: deciding WHO is
 * owed money (the run), and recording that the bank actually moved it (the
 * UTR). Collapsing them into one button is how settlements get marked paid
 * before the transfer exists.
 */
export default function AdminSettlementsPage() {
  return (
    <>
      <h1 className="font-display text-ink text-xl">Settlements</h1>
      <p className="text-muted mt-1 text-sm">
        Seller payouts. Money clears {FINANCE.settlementHoldDays} days after delivery, once its
        return window has closed.
      </p>

      <Suspense fallback={<div className="skeleton mt-6 h-96 rounded-lg" aria-hidden />}>
        <SettlementsView />
      </Suspense>
    </>
  );
}

async function SettlementsView() {
  // Reading the ledger and paying out are different permissions on purpose.
  const user = await requirePermission('settlement:read');
  const canPay = user.permissions.includes('finance:payout');

  const [settlements, sellerCol] = await Promise.all([
    listAllSettlements({ limit: 60 }),
    collections.sellers(),
  ]);

  const sellers = toEntities(
    await sellerCol
      .find({ status: { $in: ['ACTIVE', 'APPROVED'] } })
      .sort({ displayName: 1 })
      .toArray(),
  );

  const owed = settlements
    .filter((s) => s.status === 'PENDING' || s.status === 'PROCESSING')
    .reduce((sum, s) => sum + s.netPayable, 0);

  return (
    <div className="mt-6 space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Figure label="Awaiting transfer" value={formatMoney(owed)} />
        <Figure
          label="On hold"
          value={formatMoney(
            settlements.filter((s) => s.status === 'ON_HOLD').reduce((sum, s) => sum + s.netPayable, 0),
          )}
        />
        <Figure
          label="Paid this period"
          value={formatMoney(
            settlements.filter((s) => s.status === 'PAID').reduce((sum, s) => sum + s.netPayable, 0),
          )}
        />
      </div>

      {canPay ? <RunSettlement sellers={sellers.map((s) => ({ id: s.id, name: s.displayName }))} /> : null}

      {settlements.length === 0 ? (
        <div className="border-line rounded-lg border border-dashed p-12 text-center">
          <p className="text-ink text-md font-medium">No settlements yet</p>
          <p className="text-muted mx-auto mt-1.5 max-w-sm text-sm">
            Run a payout for a seller once their delivered orders have cleared the hold period.
          </p>
        </div>
      ) : (
        <ul className="space-y-3">
          {settlements.map((settlement) => (
            <li key={settlement.id} className="border-line bg-raised rounded-lg border p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-ink text-sm font-semibold">{settlement.sellerName}</p>
                  <p className="text-faint tabular mt-0.5 text-2xs">
                    {settlement.settlementNumber} · {formatDate(settlement.periodFrom)} –{' '}
                    {formatDate(settlement.periodTo)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-ink tabular text-md font-semibold">
                    {formatMoney(settlement.netPayable)}
                  </p>
                  <div className="mt-1 flex justify-end">
                    <StatusBadge meta={SETTLEMENT_STATUS_META[settlement.status]} size="sm" />
                  </div>
                </div>
              </div>

              <dl className="border-line mt-3 flex flex-wrap gap-x-6 gap-y-1 border-t pt-3 text-2xs">
                <Pair label="Gross" value={formatMoney(settlement.grossSales)} />
                <Pair label="Returns" value={formatMoney(settlement.returns)} />
                <Pair label="Commission" value={formatMoney(settlement.commission)} />
                <Pair label="Gateway" value={formatMoney(settlement.paymentGatewayFee)} />
                <Pair label="TCS + TDS" value={formatMoney(settlement.tcs + settlement.tds)} />
                {settlement.utr ? <Pair label="UTR" value={settlement.utr} /> : null}
              </dl>

              {settlement.holdReason ? (
                <p className="text-warning-700 mt-2 text-xs">{settlement.holdReason}</p>
              ) : null}

              {canPay ? (
                <SettlementActions settlementId={settlement.id} status={settlement.status} />
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Figure({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-line bg-raised rounded-lg border p-4">
      <p className="text-faint text-2xs uppercase tracking-[0.12em]">{label}</p>
      <p className="text-ink tabular mt-1 text-xl font-semibold">{value}</p>
    </div>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-1.5">
      <dt className="text-faint">{label}</dt>
      <dd className="text-ink tabular">{value}</dd>
    </div>
  );
}
