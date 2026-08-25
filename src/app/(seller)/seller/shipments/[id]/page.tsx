import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { ShipmentTracker } from '@/components/commerce/shipment-tracker';
import { ShipmentActions } from '@/components/console/shipment-actions';
import { formatMoney } from '@/lib/format';
import { requireSeller } from '@/server/auth/session';
import { collections, toEntities, toEntity } from '@/server/db/collections';
import { getShipment } from '@/server/services/shipments';

export const metadata: Metadata = { title: 'Shipment' };

export default function SellerShipmentPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="skeleton h-96 rounded-lg" aria-hidden />}>
      <ShipmentDetail params={params} />
    </Suspense>
  );
}

async function ShipmentDetail({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user] = await Promise.all([params, requireSeller()]);

  const shipment = await getShipment(id);
  // Ownership is checked here, not in a query filter, so a seller poking at
  // another seller's id gets a 404 rather than a differently-shaped error that
  // would confirm the parcel exists.
  if (!shipment || shipment.sellerId !== user.sellerId) notFound();

  const itemCol = await collections.orderItems();
  const items = toEntities(
    await itemCol.find({ _id: { $in: shipment.items.map((line) => line.orderItemId) } }).toArray(),
  );

  const locations = await collections.sellerLocations();
  const pickup = toEntity(await locations.findOne({ _id: shipment.pickupLocationId }));

  return (
    <>
      <nav className="text-2xs mb-3">
        <Link href="/seller/shipments" className="text-muted hover:text-ink">
          ← All shipments
        </Link>
      </nav>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-ink tabular text-xl">{shipment.shipmentNumber}</h1>
          <p className="text-muted mt-1 text-sm">
            Order{' '}
            <Link href="/seller/orders" className="text-ink underline-offset-2 hover:underline">
              {shipment.orderNumber}
            </Link>
            {shipment.manifestId ? ' · manifested' : ''}
          </p>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="min-w-0">
          <ShipmentTracker shipment={shipment} />

          <section className="border-line bg-raised mt-6 rounded-lg border p-5">
            <h2 className="text-ink text-md font-semibold">Contents</h2>
            <ul className="mt-3 space-y-3">
              {items.map((item) => {
                const line = shipment.items.find((entry) => entry.orderItemId === item.id);
                return (
                  <li key={item.id} className="flex items-start justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="text-ink truncate">{item.productTitle}</p>
                      <p className="text-faint mt-0.5 text-2xs">
                        {item.size} · {item.colorLabel} · SKU {item.sku}
                      </p>
                    </div>
                    <p className="text-ink tabular shrink-0 text-xs font-medium">
                      × {line?.quantity ?? item.quantity}
                    </p>
                  </li>
                );
              })}
            </ul>

            <ShipmentActions
              shipmentId={shipment.id}
              status={shipment.status}
              hasLabel={Boolean(shipment.awb)}
              invoiceId={shipment.invoiceId}
            />
          </section>
        </div>

        <aside className="space-y-4">
          <section className="border-line bg-raised rounded-lg border p-5">
            <h2 className="text-faint text-2xs uppercase tracking-[0.12em]">Deliver to</h2>
            <address className="text-ink mt-2 text-sm not-italic leading-relaxed">
              <span className="font-medium">{shipment.deliveryAddress.fullName}</span>
              <br />
              {shipment.deliveryAddress.line1}
              {shipment.deliveryAddress.line2 ? (
                <>
                  <br />
                  {shipment.deliveryAddress.line2}
                </>
              ) : null}
              <br />
              {shipment.deliveryAddress.city}, {shipment.deliveryAddress.state}
              <br />
              <span className="tabular">{shipment.deliveryAddress.pincode}</span>
            </address>
          </section>

          {pickup ? (
            <section className="border-line bg-raised rounded-lg border p-5">
              <h2 className="text-faint text-2xs uppercase tracking-[0.12em]">Pick up from</h2>
              <address className="text-ink mt-2 text-sm not-italic leading-relaxed">
                <span className="font-medium">{pickup.name}</span>
                <br />
                {pickup.city}, {pickup.state}
                <br />
                <span className="tabular">{pickup.pincode}</span>
              </address>
            </section>
          ) : null}

          <section className="border-line bg-raised rounded-lg border p-5">
            <h2 className="text-faint text-2xs uppercase tracking-[0.12em]">Parcel</h2>
            <dl className="mt-2 space-y-1.5 text-sm">
              <Row label="Weight" value={`${(shipment.weightGrams / 1000).toFixed(2)} kg`} />
              <Row
                label="Dimensions"
                value={`${shipment.dimensionsCm.length} × ${shipment.dimensionsCm.width} × ${shipment.dimensionsCm.height} cm`}
              />
              <Row label="Declared value" value={formatMoney(shipment.declaredValue)} />
              {shipment.codAmount > 0 ? (
                <Row label="Collect on delivery" value={formatMoney(shipment.codAmount)} />
              ) : null}
              {shipment.deliveryAttempts > 0 ? (
                <Row label="Delivery attempts" value={String(shipment.deliveryAttempts)} />
              ) : null}
            </dl>
          </section>
        </aside>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <dt className="text-muted">{label}</dt>
      <dd className="text-ink tabular text-right font-medium">{value}</dd>
    </div>
  );
}
