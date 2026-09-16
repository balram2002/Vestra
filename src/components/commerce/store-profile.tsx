import { BadgeCheck, MapPin, PackageCheck, ShieldCheck, Star, Truck } from 'lucide-react';
import type { Seller } from '@/domain/types';
import { formatCompactNumber } from '@/lib/format';
import { Picture } from '@/components/ui/picture';
import { ShareMenu } from './share-menu';

export function StoreProfile({ seller }: { seller: Seller }) {
  const stats = seller.storefrontStats;
  const verified = Boolean(seller.kyc.verifiedAt);
  return <header className="bg-raised border-line mt-3 overflow-hidden rounded-3xl border">
    <div className="relative h-24 overflow-hidden sm:h-48 lg:h-56">
      {seller.bannerUrl ? <Picture src={seller.bannerUrl} name={seller.displayName} sizes="100vw" className="absolute inset-0" priority /> : <div className="absolute inset-0 bg-gradient-to-br from-amber-100 via-orange-50 to-sky-100" />}
      <div className="absolute inset-0 bg-gradient-to-t from-black/35 to-transparent" />
      <div aria-hidden className="store-awning absolute inset-x-0 top-0 h-5 border-b border-black/10 sm:h-7" />
      <div className="absolute right-3 top-8"><ShareMenu title={seller.displayName} path={`/store/${seller.slug}`} /></div>
    </div>
    <div className="relative px-4 pb-5 sm:px-7 sm:pb-7">
      <div className="flex items-end gap-4">
        <Picture src={seller.logoUrl} name={seller.displayName} sizes="112px" fit="contain" className="border-raised -mt-10 size-20 shrink-0 rounded-2xl border-4 shadow-sm sm:-mt-12 sm:size-28" />
        <div className="text-muted flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 pb-1 text-xs"><span className="inline-flex items-center gap-1"><MapPin className="size-3.5 shrink-0" />{seller.kyc.registeredAddress.city}</span><span>Since {new Date(seller.joinedAt).getFullYear()}</span></div>
      </div>
      <div className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 max-w-2xl"><h1 className="font-display text-ink text-2xl font-semibold leading-tight break-words sm:text-4xl">{seller.displayName}</h1>{seller.tagline ? <p className="text-muted mt-2 text-sm sm:text-base">{seller.tagline}</p> : null}</div>
        {verified ? <div className="bg-info-50 text-info-700 flex items-center gap-2 rounded-xl px-3 py-2"><BadgeCheck className="size-6" /><div><p className="text-sm font-semibold">Verified seller</p><p className="hidden text-xs sm:block">Identity checked by VestraWAB</p></div></div> : <span className="bg-sunken text-muted rounded-full px-3 py-2 text-xs">Independent store</span>}
      </div>
      {stats?.showStats !== false ? <dl className="border-line mt-5 grid grid-cols-3 divide-x rounded-2xl border py-4">
        <StoreStat icon={<ShieldCheck className="size-5" />} label="Trust score" value={stats?.trustScore ?? `${seller.rating.fulfilmentScore}/100`} />
        <StoreStat icon={<Truck className="size-5" />} label={stats?.averageShipTime ? 'Avg. ship time' : 'Dispatch target'} value={stats?.averageShipTime ?? `${seller.policies.dispatchSlaHours}h`} />
        <StoreStat icon={<PackageCheck className="size-5" />} label={stats?.productsSold ? 'Products sold' : 'Orders shipped'} value={stats?.productsSold ?? formatCompactNumber(seller.metrics.orderCount)} />
      </dl> : null}
      <div className="text-muted mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs"><span className="inline-flex items-center gap-1.5"><Star className="size-4 text-amber-600" />{seller.rating.count ? `${seller.rating.average} · ${formatCompactNumber(seller.rating.count)} ratings` : 'New to reviews'}</span><span>{seller.policies.returnWindowDays}-day returns on eligible items</span>{seller.policies.codEnabled ? <span>Cash on delivery available</span> : null}</div>
      {seller.about ? <details className="border-line mt-4 border-t pt-3"><summary className="text-ink cursor-pointer py-1 text-sm font-medium">About the store & policies</summary><p className="text-muted mt-3 max-w-3xl text-sm leading-relaxed break-words">{seller.about}</p>{seller.policies.shippingNote ? <p className="text-muted mt-2 text-xs">{seller.policies.shippingNote}</p> : null}{seller.policies.returnNote ? <p className="text-muted mt-2 text-xs">{seller.policies.returnNote}</p> : null}</details> : null}
    </div>
  </header>;
}

function StoreStat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return <div className="flex min-w-0 flex-col items-center px-2 text-center sm:px-4"><span aria-hidden className="text-accent-ink mb-1.5 flex justify-center">{icon}</span><dt className="text-muted order-2 mt-1 text-[11px] sm:text-xs">{label}</dt><dd className="text-ink order-1 text-base font-semibold break-words sm:text-2xl">{value}</dd></div>;
}
