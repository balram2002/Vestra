import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { Barcode } from '@/components/console/barcode';
import { PrintTrigger } from '@/components/console/print-trigger';
import { formatDate, formatMoney } from '@/lib/format';
import { requireSeller } from '@/server/auth/session';
import { collections, toEntities, toEntity } from '@/server/db/collections';
import { getShipment } from '@/server/services/shipments';

export const metadata: Metadata = { title: 'Shipping label' };

export default function LabelPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="skeleton m-8 h-[6in] w-[4in]" aria-hidden />}>
      <Label params={params} />
    </Suspense>
  );
}

/**
 * A 4×6 inch thermal shipping label.
 *
 * Laid out the way carriers expect one to read at arm's length on a conveyor:
 * destination pincode largest, then the routing barcode, then the addresses,
 * with COD called out in a box nobody can miss. The contents list sits at the
 * bottom because it matters to the packer, not the courier.
 */
async function Label({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user] = await Promise.all([params, requireSeller()]);

  const shipment = await getShipment(id);
  if (!shipment || shipment.sellerId !== user.sellerId) notFound();
  if (!shipment.awb) notFound();

  const itemCol = await collections.orderItems();
  const items = toEntities(
    await itemCol.find({ _id: { $in: shipment.items.map((line) => line.orderItemId) } }).toArray(),
  );

  const locations = await collections.sellerLocations();
  const pickup = toEntity(await locations.findOne({ _id: shipment.pickupLocationId }));
  const address = shipment.deliveryAddress;

  return (
    <>
      <PrintTrigger />

      <div className="mx-auto w-[4in] bg-white p-3 text-black print:m-0 print:w-full print:p-0">
        <div className="border-2 border-black">
          {/* Carrier and service */}
          <div className="flex items-center justify-between border-b-2 border-black px-2 py-1.5">
            <span className="text-sm font-bold uppercase tracking-wide">
              {shipment.carrier ?? 'Eshopbox'}
            </span>
            <span className="text-[10px] font-semibold uppercase">
              {shipment.carrierServiceType ?? 'Standard'}
            </span>
          </div>

          {/* Destination pincode: the single most-read thing on a label. */}
          <div className="flex items-stretch border-b-2 border-black">
            <div className="flex-1 px-2 py-1.5">
              <p className="text-[9px] uppercase tracking-wider">Destination</p>
              <p className="font-mono text-3xl font-bold leading-none tracking-tight">
                {address.pincode}
              </p>
            </div>
            {shipment.codAmount > 0 ? (
              <div className="flex w-[1.4in] flex-col justify-center border-l-2 border-black bg-black px-2 py-1.5 text-white">
                <p className="text-[9px] font-bold uppercase">Collect COD</p>
                <p className="font-mono text-lg font-bold leading-tight">
                  {formatMoney(shipment.codAmount)}
                </p>
              </div>
            ) : (
              <div className="flex w-[1.4in] flex-col justify-center border-l-2 border-black px-2 py-1.5">
                <p className="text-[9px] font-bold uppercase">Prepaid</p>
                <p className="text-[10px] leading-tight">Do not collect cash</p>
              </div>
            )}
          </div>

          {/* Routing barcode */}
          <div className="border-b-2 border-black px-2 py-2">
            <Barcode value={shipment.awb} height={54} />
          </div>

          {/* Addresses */}
          <div className="border-b-2 border-black px-2 py-1.5">
            <p className="text-[9px] font-bold uppercase tracking-wider">Deliver to</p>
            <p className="text-sm font-bold leading-tight">{address.fullName}</p>
            <p className="text-[11px] leading-snug">
              {address.line1}
              {address.line2 ? `, ${address.line2}` : ''}
              {address.landmark ? `, ${address.landmark}` : ''}
              <br />
              {address.city}, {address.state} {address.pincode}
              <br />
              <span className="font-mono">{address.phone}</span>
            </p>
          </div>

          <div className="border-b-2 border-black px-2 py-1.5">
            <p className="text-[9px] font-bold uppercase tracking-wider">Return to</p>
            <p className="text-[11px] leading-snug">
              {pickup?.name ?? 'Seller'}, {pickup?.line1 ?? ''}
              <br />
              {pickup?.city}, {pickup?.state} {pickup?.pincode}
            </p>
          </div>

          {/* Our own reference, scannable for inbound sorting. */}
          <div className="flex items-end justify-between gap-2 border-b-2 border-black px-2 py-1.5">
            <div className="min-w-0 flex-1">
              <Barcode value={shipment.shipmentNumber} height={32} showText={false} />
              <p className="mt-0.5 font-mono text-[10px]">{shipment.shipmentNumber}</p>
            </div>
            <div className="text-right text-[9px] leading-tight">
              <p>Order {shipment.orderNumber}</p>
              <p>{formatDate(shipment.createdAt)}</p>
              <p>{(shipment.weightGrams / 1000).toFixed(2)} kg</p>
            </div>
          </div>

          {/* Packing list */}
          <div className="px-2 py-1.5">
            <p className="text-[9px] font-bold uppercase tracking-wider">Contents</p>
            <ul className="mt-0.5">
              {items.map((item) => {
                const line = shipment.items.find((entry) => entry.orderItemId === item.id);
                return (
                  <li key={item.id} className="flex justify-between gap-2 text-[10px] leading-snug">
                    <span className="min-w-0 truncate">
                      {item.productTitle} · {item.size}
                    </span>
                    <span className="shrink-0 font-mono">×{line?.quantity ?? item.quantity}</span>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>

        <p className="mt-2 text-center text-[9px] text-neutral-500 print:hidden">
          4 × 6 in thermal label · print at 100% scale, no margins
        </p>
      </div>
    </>
  );
}
