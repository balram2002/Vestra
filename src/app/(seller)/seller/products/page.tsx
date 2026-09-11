import { Plus } from 'lucide-react';
import type { Metadata } from 'next';

import { PageHeader } from '@/components/console/page-header';
import { Button } from '@/components/ui/button';
import { Tabs } from '@/components/ui/tabs';
import Image from 'next/image';
import Link from 'next/link';
import { Suspense } from 'react';

import { DataTable, TableEmpty, type Column } from '@/components/console/data-table';
import { StatusBadge } from '@/components/ui/badge';
import { PRODUCT_STATUS_META } from '@/domain/enums';
import type { Product } from '@/domain/types';
import { formatDateShort, formatMoney } from '@/lib/format';
import { requireSeller } from '@/server/auth/session';
import { listSellerProducts } from '@/server/services/seller';

export const metadata: Metadata = { title: 'Products' };

const TABS = ['ALL', 'PUBLISHED', 'PENDING_REVIEW', 'DRAFT', 'REJECTED', 'ARCHIVED'] as const;

export default function SellerProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  return (
    <>
      <PageHeader
        title="Products"
        description="Every style you list, with the stock and price shoppers actually see."
        actions={
          <Button asChild size="sm">
            <Link href="/seller/products/new">
              <Plus className="size-3.5" aria-hidden />
              New listing
            </Link>
          </Button>
        }
      />

      <Suspense fallback={<div className="skeleton mt-6 h-96 rounded-lg" aria-hidden />}>
        <ProductTable searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function ProductTable({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; page?: string }>;
}) {
  const [params, user] = await Promise.all([searchParams, requireSeller()]);
  const status = params.status ?? 'ALL';
  const page = Number.parseInt(params.page ?? '1', 10) || 1;

  const { rows, total, pageSize } = await listSellerProducts(user.sellerId, { status, page });
  const pageCount = Math.max(1, Math.ceil(total / pageSize));

  const columns: Column<Product>[] = [
    {
      key: 'product',
      header: 'Style',
      render: (product) => (
        <div className="flex min-w-0 items-center gap-3">
          <div className="bg-sunken relative aspect-3/4 w-9 shrink-0 overflow-hidden rounded-sm">
            {product.media[0] ? (
              <Image
                src={product.media[0].url}
                alt=""
                fill
                sizes="36px"
                className="object-cover"
              />
            ) : null}
          </div>
          <div className="min-w-0">
            {/*
              Links to the EDITOR, not the storefront. A seller clicking a row
              in their own console wants to change the listing; the public page
              is one click further on, from the editor itself.
            */}
            <Link
              href={`/seller/products/${product.id}`}
              className="row-link text-ink block truncate text-xs font-medium hover:underline"
            >
              {product.title}
            </Link>
            <p className="text-faint tabular text-2xs">{product.styleCode}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      render: (product) => (
        <StatusBadge meta={PRODUCT_STATUS_META[product.status]} size="sm" />
      ),
    },
    {
      key: 'price',
      header: 'Price',
      numeric: true,
      render: (product) => (
        <div>
          <p className="text-ink text-xs font-semibold">
            {formatMoney(product.priceRange.minSellingPrice)}
          </p>
          {product.maxDiscountPercent > 0 ? (
            <p className="text-danger-600 text-2xs">{product.maxDiscountPercent}% off</p>
          ) : null}
        </div>
      ),
    },
    {
      key: 'stock',
      header: 'In stock',
      numeric: true,
      secondary: true,
      render: (product) => {
        const total = product.variants.reduce((sum, v) => sum + v.inventory.available, 0);
        const sizes = product.variants.filter((v) => v.inventory.available > 0).length;
        return (
          <div>
            <p className={total === 0 ? 'text-danger-600 text-xs font-semibold' : 'text-ink text-xs'}>
              {total}
            </p>
            <p className="text-faint text-2xs">
              {sizes}/{product.variants.length} sizes
            </p>
          </div>
        );
      },
    },
    {
      key: 'sold',
      header: 'Sold 30d',
      numeric: true,
      secondary: true,
      render: (product) => <span className="text-ink text-xs">{product.stats.unitsSold30d}</span>,
    },
    {
      key: 'updated',
      header: 'Updated',
      numeric: true,
      secondary: true,
      render: (product) => (
        <span className="text-faint text-2xs">{formatDateShort(product.updatedAt)}</span>
      ),
    },
  ];

  return (
    <div className="mt-6">
      <Tabs
        label="Filter products"
        items={TABS.map((tab) => ({ value: tab, label: tab === 'ALL' ? 'All' : PRODUCT_STATUS_META[tab].label }))}
        current={status}
        href={(value) => `/seller/products?status=${value}`}
      />

      <p className="text-faint mt-4 text-xs">
        {total} {total === 1 ? 'style' : 'styles'}
        {pageCount > 1 ? ` · page ${page} of ${pageCount}` : ''}
      </p>

      <DataTable
        className="mt-2"
        columns={columns}
        rows={rows}
        rowKey={(product) => product.id}
        caption="Your products"
        empty={
          <TableEmpty
            title="Nothing here"
            body="No styles match this filter. Try another tab."
          />
        }
      />
    </div>
  );
}
