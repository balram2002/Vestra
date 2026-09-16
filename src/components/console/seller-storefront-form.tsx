'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import type { Seller } from '@/domain/types';
import { Button } from '@/components/ui/button';
import { saveSellerStorefront } from '@/server/actions/seller-storefront';

export function SellerStorefrontForm({ sellerId, stats }: { sellerId: string; stats: Seller['storefrontStats'] }) {
  const [pending, start] = useTransition();
  const [values, setValues] = useState({ trustScore: stats?.trustScore ?? '', averageShipTime: stats?.averageShipTime ?? '', productsSold: stats?.productsSold ?? '', showStats: stats?.showStats ?? true });
  return <section className="bg-raised border-line mt-6 rounded-2xl border p-5 sm:p-6">
    <h2 className="font-display text-xl font-semibold">Public storefront scorecard</h2>
    <p className="text-muted mt-2 max-w-2xl text-sm">Set the figures shoppers see on this seller’s page. Leave a field empty to use its operational record. Only publish figures you can substantiate; these changes do not alter orders or performance reports.</p>
    <form onSubmit={(event) => { event.preventDefault(); start(async () => { const result = await saveSellerStorefront(sellerId, values); if (result.ok) toast.success('Storefront scorecard saved'); else toast.error(result.error); }); }} className="mt-5 space-y-5">
      <div className="grid gap-4 sm:grid-cols-3">
        {([{ key: 'trustScore', label: 'Trust score', hint: 'Example: 98/100' }, { key: 'averageShipTime', label: 'Average ship time', hint: 'Example: <1 day' }, { key: 'productsSold', label: 'Products sold', hint: 'Example: 1.5L' }] as const).map(({ key, label, hint }) => <label key={key} className="min-w-0 text-sm font-medium">{label}<input maxLength={24} value={values[key]} onChange={(event) => setValues({ ...values, [key]: event.target.value })} placeholder="Use operational record" className="bg-canvas border-line mt-2 block h-11 w-full min-w-0 rounded-xl border px-3 font-normal" /><span className="text-muted mt-1 block text-xs font-normal">{hint}</span></label>)}
      </div>
      <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={values.showStats} onChange={(event) => setValues({ ...values, showStats: event.target.checked })} />Show the scorecard on the public store page</label>
      <div className="flex flex-wrap gap-3"><Button type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save scorecard'}</Button><Button type="button" variant="secondary" onClick={() => setValues({ trustScore: '', averageShipTime: '', productsSold: '', showStats: true })}>Use defaults</Button></div>
    </form>
  </section>;
}
