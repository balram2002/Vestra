import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

import { PrintTrigger } from '@/components/console/print-trigger';
import { siteConfig } from '@/config/site';
import { formatDate, formatMoney } from '@/lib/format';
import { requireUser } from '@/server/auth/session';
import { hasPermission } from '@/server/auth/rbac';
import { getInvoiceFor } from '@/server/services/invoices';

export const metadata: Metadata = { title: 'Tax invoice' };

export default function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="skeleton m-8 h-[10in] max-w-[8.5in]" aria-hidden />}>
      <InvoiceDocument params={params} />
    </Suspense>
  );
}

/**
 * A GST tax invoice, laid out for A4.
 *
 * Deliberately plain. An invoice is a legal document that gets photocopied,
 * emailed and read by a tax officer, so it uses rules and boxes rather than the
 * storefront's typography — the brand belongs in the header and nowhere else.
 *
 * Everything shown is read from the stored invoice, never recomputed. A
 * reprint a year from now must be identical to the original.
 */
async function InvoiceDocument({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, user] = await Promise.all([params, requireUser()]);

  const invoice = await getInvoiceFor(id, {
    userId: user.id,
    sellerId: user.sellerId,
    canReadAnyOrder: hasPermission(user.permissions, 'order:read'),
  });
  // A 404 rather than a 403: someone else's invoice should not be confirmed to
  // exist at all.
  if (!invoice) notFound();

  const isCredit = invoice.type === 'CREDIT_NOTE';

  return (
    <>
      <PrintTrigger label="Print invoice" />

      <div className="mx-auto my-6 w-[8.27in] max-w-full bg-white p-8 text-black shadow-sm print:my-0 print:w-full print:p-0 print:shadow-none">
        {/* ------------------------------------------------------ header */}
        <header className="flex items-start justify-between gap-6 border-b-2 border-black pb-4">
          <div>
            <p className="font-display text-2xl font-semibold tracking-tight">{siteConfig.name}</p>
            <p className="mt-0.5 text-[11px] leading-snug text-neutral-600">
              {siteConfig.legalName}
              <br />
              Marketplace facilitator · {siteConfig.address.city}, {siteConfig.address.state}
            </p>
          </div>

          <div className="text-right">
            <p className="text-sm font-bold uppercase tracking-wide">
              {isCredit ? 'Credit note' : 'Tax invoice'}
            </p>
            <p className="mt-1 font-mono text-xs">{invoice.invoiceNumber}</p>
            <p className="text-[11px] text-neutral-600">{formatDate(invoice.issuedAt)}</p>
            {isCredit && invoice.relatedInvoiceId ? (
              <p className="mt-1 text-[10px] text-neutral-600">Against the original tax invoice</p>
            ) : null}
          </div>
        </header>

        {/* ---------------------------------------------------- parties */}
        <section className="grid grid-cols-2 gap-6 border-b border-neutral-300 py-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
              Sold by
            </p>
            <p className="mt-1 text-sm font-semibold">{invoice.sellerName}</p>
            <p className="text-[11px] leading-snug text-neutral-700">{invoice.sellerAddress}</p>
            <p className="mt-1 font-mono text-[11px]">GSTIN {invoice.sellerGstin}</p>
          </div>

          <div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
              Billed and shipped to
            </p>
            <p className="mt-1 text-sm font-semibold">{invoice.buyerName}</p>
            <p className="text-[11px] leading-snug text-neutral-700">
              {invoice.buyerAddress.line1}
              {invoice.buyerAddress.line2 ? `, ${invoice.buyerAddress.line2}` : ''}
              <br />
              {invoice.buyerAddress.city}, {invoice.buyerAddress.state}{' '}
              {invoice.buyerAddress.pincode}
            </p>
            <p className="mt-1 text-[11px]">
              Place of supply: <span className="font-medium">{invoice.placeOfSupply}</span>
            </p>
          </div>
        </section>

        <p className="py-2 text-[11px] text-neutral-600">
          Order <span className="font-mono">{invoice.orderNumber}</span>
        </p>

        {/* ------------------------------------------------------- lines */}
        <table className="w-full border-collapse text-[11px]">
          <thead>
            <tr className="border-y border-black text-left">
              <th className="py-1.5 pr-2 font-semibold">Description</th>
              <th className="px-1 py-1.5 font-semibold">HSN</th>
              <th className="px-1 py-1.5 text-right font-semibold">Qty</th>
              <th className="px-1 py-1.5 text-right font-semibold">MRP</th>
              <th className="px-1 py-1.5 text-right font-semibold">Discount</th>
              <th className="px-1 py-1.5 text-right font-semibold">Taxable</th>
              {invoice.isInterState ? (
                <th className="px-1 py-1.5 text-right font-semibold">IGST</th>
              ) : (
                <>
                  <th className="px-1 py-1.5 text-right font-semibold">CGST</th>
                  <th className="px-1 py-1.5 text-right font-semibold">SGST</th>
                </>
              )}
              <th className="py-1.5 pl-1 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {invoice.lines.map((line, index) => (
              <tr key={`${line.sku}-${index}`} className="border-b border-neutral-200 align-top">
                <td className="py-2 pr-2">
                  {line.description}
                  <br />
                  <span className="font-mono text-[10px] text-neutral-500">{line.sku}</span>
                </td>
                <td className="px-1 py-2 font-mono">{line.hsnCode}</td>
                <td className="px-1 py-2 text-right">{line.quantity}</td>
                <td className="px-1 py-2 text-right">{formatMoney(line.unitPrice)}</td>
                <td className="px-1 py-2 text-right">{formatMoney(line.discount)}</td>
                <td className="px-1 py-2 text-right">{formatMoney(line.taxableValue, { precise: true })}</td>
                {invoice.isInterState ? (
                  <td className="px-1 py-2 text-right">{formatMoney(line.igst, { precise: true })}</td>
                ) : (
                  <>
                    <td className="px-1 py-2 text-right">{formatMoney(line.cgst, { precise: true })}</td>
                    <td className="px-1 py-2 text-right">{formatMoney(line.sgst, { precise: true })}</td>
                  </>
                )}
                <td className="py-2 pl-1 text-right font-semibold">
                  {formatMoney(line.total, { precise: true })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* ------------------------------------------------------ totals */}
        <section className="mt-4 flex justify-between gap-8">
          <div className="max-w-[3.6in]">
            <p className="text-[10px] font-bold uppercase tracking-wider text-neutral-500">
              Tax summary
            </p>
            <table className="mt-1 w-full border-collapse text-[10px]">
              <thead>
                <tr className="border-b border-neutral-300 text-left">
                  <th className="py-1 pr-2">Rate</th>
                  <th className="py-1 pr-2 text-right">Taxable</th>
                  <th className="py-1 text-right">Tax</th>
                </tr>
              </thead>
              <tbody>
                {invoice.taxBreakup.map((slab) => (
                  <tr key={slab.ratePercent} className="border-b border-neutral-100">
                    <td className="py-1 pr-2">{slab.ratePercent}%</td>
                    <td className="py-1 pr-2 text-right">
                      {formatMoney(slab.taxableValue, { precise: true })}
                    </td>
                    <td className="py-1 text-right">{formatMoney(slab.total, { precise: true })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <dl className="w-[2.8in] shrink-0 text-[11px]">
            <Row label="Subtotal (MRP)" value={formatMoney(invoice.subtotal, { precise: true })} />
            <Row label="Discount" value={`− ${formatMoney(invoice.discount, { precise: true })}`} />
            <Row label="Taxable value" value={formatMoney(invoice.taxableValue, { precise: true })} />
            {invoice.taxBreakup.map((slab) => (
              <Row
                key={slab.ratePercent}
                label={
                  invoice.isInterState
                    ? `IGST @ ${slab.ratePercent}%`
                    : `CGST + SGST @ ${slab.ratePercent}%`
                }
                value={formatMoney(slab.total, { precise: true })}
              />
            ))}
            {invoice.shippingFee > 0 ? (
              <Row label="Delivery" value={formatMoney(invoice.shippingFee, { precise: true })} />
            ) : null}
            {invoice.roundOff !== 0 ? (
              <Row
                label="Round off"
                value={`${invoice.roundOff > 0 ? '+' : '−'} ${formatMoney(Math.abs(invoice.roundOff), { precise: true })}`}
              />
            ) : null}
            <div className="mt-1 flex justify-between border-t-2 border-black pt-1.5 text-sm font-bold">
              <dt>{isCredit ? 'Credit total' : 'Amount payable'}</dt>
              <dd className="font-mono">{formatMoney(invoice.total)}</dd>
            </div>
          </dl>
        </section>

        <p className="mt-3 border-t border-neutral-300 pt-2 text-[11px]">
          <span className="text-neutral-500">In words: </span>
          {invoice.amountInWords}
        </p>

        {/* ------------------------------------------------------ footer */}
        <footer className="mt-6 flex items-end justify-between gap-6 border-t border-neutral-300 pt-3 text-[10px] text-neutral-600">
          <p className="max-w-[4.5in] leading-snug">
            {siteConfig.legalName} is a marketplace facilitator. The supply above is made by the
            seller named on this invoice, who is solely responsible for it. This is a
            computer-generated document and needs no signature.
          </p>
          <p className="shrink-0 text-right">
            For {invoice.sellerName}
            <br />
            <span className="mt-6 block border-t border-neutral-400 pt-1">Authorised signatory</span>
          </p>
        </footer>
      </div>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 py-0.5">
      <dt className="text-neutral-600">{label}</dt>
      <dd className="font-mono">{value}</dd>
    </div>
  );
}
