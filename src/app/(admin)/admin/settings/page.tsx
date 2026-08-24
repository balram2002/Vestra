import type { Metadata } from 'next';
import { Suspense } from 'react';

import { DataTable, TableEmpty, type Column } from '@/components/console/data-table';
import {
  CART,
  FINANCE,
  INVENTORY,
  ORDERS,
  PRICING,
  RETURNS,
  SHIPPING,
} from '@/config/business';
import type { Role } from '@/domain/types';
import { formatMoney } from '@/lib/format';
import { requirePermission } from '@/server/auth/session';
import { collections, toEntities } from '@/server/db/collections';

export const metadata: Metadata = { title: 'Settings' };

/**
 * Platform settings and the RBAC matrix.
 *
 * The values shown come from `config/business.ts`, which is the single source
 * of truth for every threshold in the system. They are read-only here on
 * purpose: making them editable at runtime without a migration path and an
 * audit entry would let someone change the commission rate with no record of
 * who did it or when.
 */
export default function AdminSettingsPage() {
  return (
    <>
      <h1 className="font-display text-ink text-xl">Settings</h1>
      <p className="text-muted mt-1 text-sm">
        Platform-wide thresholds and what each role may do.
      </p>

      <Suspense fallback={<div className="skeleton mt-6 h-96 rounded-lg" aria-hidden />}>
        <Settings />
      </Suspense>
    </>
  );
}

async function Settings() {
  await requirePermission('settings:write');

  const roleCol = await collections.roles();
  const roles = toEntities(await roleCol.find({}).toArray());

  const columns: Column<Role>[] = [
    {
      key: 'role',
      header: 'Role',
      render: (role) => (
        <div className="min-w-0">
          <p className="text-ink text-xs font-medium">{role.name}</p>
          <p className="text-faint truncate text-2xs">{role.description}</p>
        </div>
      ),
    },
    {
      key: 'permissions',
      header: 'Permissions',
      numeric: true,
      render: (role) => <span className="text-ink text-xs">{role.permissions.length}</span>,
    },
    {
      key: 'system',
      header: 'Built in',
      numeric: true,
      secondary: true,
      render: (role) => (
        <span className="text-faint text-2xs">{role.system ? 'yes' : 'custom'}</span>
      ),
    },
  ];

  return (
    <div className="mt-6 space-y-6">
      <div className="grid gap-5 lg:grid-cols-2">
        <Panel title="Commerce">
          <Field label="Currency" value={`${PRICING.currency} (${PRICING.currencySymbol})`} />
          <Field label="Default GST" value={`${PRICING.defaultTaxRatePercent}%`} />
          <Field label="Origin state" value={PRICING.originState} />
          <Field label="Max per variant" value={`${CART.maxQuantityPerVariant} units`} />
          <Field label="Guest bag lifetime" value={`${CART.guestCartTtlDays} days`} />
        </Panel>

        <Panel title="Delivery">
          <Field label="Standard delivery" value={formatMoney(SHIPPING.standardFee)} />
          <Field label="Free above" value={formatMoney(SHIPPING.freeShippingThreshold)} />
          <Field label="Cash on delivery fee" value={formatMoney(SHIPPING.codFee)} />
          <Field label="Max COD order" value={formatMoney(SHIPPING.maxCodOrderValue)} />
          <Field
            label="Standard window"
            value={`${SHIPPING.standardDays.min}-${SHIPPING.standardDays.max} days`}
          />
        </Panel>

        <Panel title="Orders and returns">
          <Field label="Dispatch SLA" value={`${ORDERS.defaultDispatchSlaHours} hours`} />
          <Field label="Payment timeout" value={`${ORDERS.paymentTimeoutMinutes} minutes`} />
          <Field label="Return window" value={`${RETURNS.defaultWindowDays} days`} />
          <Field label="Pickup window" value={`${RETURNS.pickupWindowDays} days`} />
          <Field
            label="Refund SLA"
            value={`${RETURNS.refundSlaDays.prepaid}d prepaid, ${RETURNS.refundSlaDays.cod}d COD`}
          />
        </Panel>

        <Panel title="Finance and stock">
          <Field label="Commission" value={`${FINANCE.defaultCommissionPercent}%`} />
          <Field label="Gateway fee" value={`${FINANCE.paymentGatewayFeePercent}%`} />
          <Field label="Settlement hold" value={`${FINANCE.settlementHoldDays} days`} />
          <Field label="Minimum payout" value={formatMoney(FINANCE.minPayoutAmount)} />
          <Field label="Stock reservation" value={`${INVENTORY.reservationMinutes} minutes`} />
          <Field label="Low stock at" value={`${INVENTORY.defaultLowStockThreshold} units`} />
        </Panel>
      </div>

      <section>
        <h2 className="text-ink mb-2 text-md font-semibold">Roles</h2>
        <DataTable
          columns={columns}
          rows={roles}
          rowKey={(role) => role.id}
          caption="Roles"
          empty={<TableEmpty title="No roles" body="Roles are seeded with the platform." />}
        />
      </section>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-line bg-raised rounded-lg border">
      <header className="border-line border-b px-5 py-3.5">
        <h2 className="text-ink text-md font-semibold">{title}</h2>
      </header>
      <dl className="divide-line divide-y">{children}</dl>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 px-5 py-2.5">
      <dt className="text-muted text-xs">{label}</dt>
      <dd className="text-ink tabular text-xs">{value}</dd>
    </div>
  );
}
