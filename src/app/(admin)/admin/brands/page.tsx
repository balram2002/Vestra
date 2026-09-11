import type { Metadata } from 'next';
import { Suspense } from 'react';

import { BrandToggle } from '@/components/console/admin-actions';
import { CreateBrandDialog } from '@/components/console/admin-create';
import { DataTable, TableEmpty, type Column } from '@/components/console/data-table';
import { PageHeader } from '@/components/console/page-header';
import { Avatar } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import type { Brand } from '@/domain/types';
import { formatDateShort } from '@/lib/format';
import { hasPermission } from '@/server/auth/rbac';
import { getSessionUser, requirePermission } from '@/server/auth/session';
import { collections, toEntities } from '@/server/db/collections';

export const metadata: Metadata = { title: 'Brands' };

/**
 * Brands.
 *
 * The labels sellers list under. A listing cannot be submitted without a
 * brand, and there was no way to add one outside the demo seed, so a clean
 * database could never take its first product. This page is where the
 * catalogue starts.
 */
export default function AdminBrandsPage() {
  return (
    <>
      <PageHeader
        title="Brands"
        description="The labels sellers can list under. A listing cannot be submitted without one, so add a brand before its first product."
        actions={
          <Suspense fallback={null}>
            <NewBrandAction />
          </Suspense>
        }
      />

      <Suspense fallback={<div className="skeleton mt-6 h-96 rounded-xl" aria-hidden />}>
        <BrandTable />
      </Suspense>
    </>
  );
}

/** Only someone who can edit the catalogue gets the button. */
async function NewBrandAction() {
  const user = await getSessionUser();
  if (!user || !hasPermission(user.permissions, 'catalog:write')) return null;
  return <CreateBrandDialog />;
}

async function BrandTable() {
  const user = await requirePermission('catalog:read');
  const canWrite = hasPermission(user.permissions, 'catalog:write');

  const brandCol = await collections.brands();
  const brands = toEntities(await brandCol.find({}).sort({ name: 1 }).toArray());

  const columns: Column<Brand>[] = [
    {
      key: 'brand',
      header: 'Brand',
      render: (brand) => (
        <div className="flex min-w-0 items-center gap-3">
          <Avatar name={brand.name} src={brand.logoUrl} size="sm" square />
          <div className="min-w-0">
            <p className="text-ink truncate text-xs font-medium">{brand.name}</p>
            <p className="text-faint truncate text-2xs">/brand/{brand.slug}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'code',
      header: 'Code',
      render: (brand) => <span className="text-muted font-mono text-xs">{brand.code}</span>,
    },
    {
      key: 'products',
      header: 'Live products',
      numeric: true,
      render: (brand) => <span className="text-ink tabular text-xs">{brand.productCount}</span>,
    },
    {
      key: 'origin',
      header: 'Origin',
      secondary: true,
      render: (brand) => <span className="text-muted text-xs">{brand.originCountry}</span>,
    },
    {
      key: 'premium',
      header: '',
      secondary: true,
      render: (brand) =>
        brand.isPremium ? (
          <Badge tone="premium" size="sm">
            Premium
          </Badge>
        ) : null,
    },
    {
      key: 'added',
      header: 'Added',
      numeric: true,
      secondary: true,
      render: (brand) => <span className="text-faint text-2xs">{formatDateShort(brand.createdAt)}</span>,
    },
    {
      key: 'state',
      header: canWrite ? '' : 'State',
      render: (brand) =>
        canWrite ? (
          <BrandToggle brandId={brand.id} name={brand.name} isActive={brand.isActive} />
        ) : (
          <Badge tone={brand.isActive ? 'success' : 'neutral'} size="sm">
            {brand.isActive ? 'Visible' : 'Hidden'}
          </Badge>
        ),
    },
  ];

  return (
    <div className="mt-6">
      <DataTable
        columns={columns}
        rows={brands}
        rowKey={(brand) => brand.id}
        caption="Brands"
        empty={
          <TableEmpty
            title="No brands yet"
            body="Add the first one with New brand. Sellers need one before they can submit a listing."
          />
        }
      />
    </div>
  );
}