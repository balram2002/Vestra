import {
  ArrowRight,
  BadgePercent,
  CalendarClock,
  FileText,
  LayoutTemplate,
  Megaphone,
  PanelsTopLeft,
  Palette,
  Ticket,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';

import { PageHeader } from '@/components/console/page-header';
import { StatCard } from '@/components/console/stat-card';
import { CAMPAIGN_STATUS_LABEL } from '@/domain/campaign-status';
import { cn } from '@/lib/cn';
import { getMarketingOverview, type CampaignLine } from '@/server/services/marketing-overview';

export const metadata: Metadata = { title: 'Marketing' };

/**
 * Marketing, at a glance.
 *
 * The first screen of the section answers the three questions asked every
 * morning: what is live on each page, what is about to start or stop, and is
 * anything waiting on me (an unpublished draft, a scheduled change). Every
 * line links to the screen that changes it.
 */
export default function MarketingOverviewPage() {
  return (
    <>
      <PageHeader
        title="Marketing"
        description="What shoppers see right now, what changes next, and what is waiting to be published."
      />
      <Suspense fallback={<OverviewSkeleton />}>
        <Overview />
      </Suspense>
    </>
  );
}

const FORMAT = new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

async function Overview() {
  const data = await getMarketingOverview();
  const waiting = data.designs.filter((design) => design.hasDraft || design.scheduledAt).length;
  const endingCount = data.endingSoon.length;

  return (
    <div className="mt-6 space-y-8">
      <section aria-label="Summary" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Live coupons" value={String(data.coupons.live)} hint={`${data.coupons.scheduled} scheduled · ${data.coupons.paused} paused`} />
        <StatCard label="Live promotions" value={String(data.promotions.live)} hint={`${data.promotions.scheduled} scheduled · ${data.promotions.paused} paused`} />
        <StatCard label="Ending this week" value={String(endingCount)} hint="Live, and stopping within 7 days" />
        <StatCard label="Waiting on you" value={String(waiting)} hint="Unpublished drafts or schedules" />
      </section>

      {/* ---------------------------------------------------- page designs */}
      <section aria-labelledby="designs-heading">
        <SectionTitle id="designs-heading" icon={<LayoutTemplate className="size-4" aria-hidden />} title="Page designs" />
        <div className="border-line bg-raised divide-line divide-y rounded-lg border">
          {data.designs.map((design) => (
            <Link
              key={design.page}
              href={`/admin/design/${design.page}`}
              className="hover:bg-sunken/60 flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3 sm:px-5"
            >
              <span className="min-w-40 flex-1">
                <span className="text-ink block text-sm font-semibold">{design.title}</span>
                <span className="text-faint block font-mono text-2xs">{design.route}</span>
              </span>
              <span className="text-ink text-sm">
                Variant {design.live.number} · {design.live.name}
              </span>
              <span className="flex flex-wrap gap-1.5">
                {design.hasDraft ? <Pill tone="warning">Draft</Pill> : null}
                {design.scheduledAt ? (
                  <Pill tone="info">Scheduled {FORMAT.format(new Date(design.scheduledAt))}</Pill>
                ) : null}
              </span>
              <span className="text-muted w-full text-xs sm:w-auto">
                {design.lastPublishedAt
                  ? `Published ${FORMAT.format(new Date(design.lastPublishedAt))} by ${design.lastPublishedBy}`
                  : 'As shipped'}
              </span>
              <ArrowRight className="text-faint size-4" aria-hidden />
            </Link>
          ))}
        </div>
      </section>

      {/* ------------------------------------------------------ campaigns */}
      <section aria-labelledby="campaigns-heading" className="grid gap-6 lg:grid-cols-2">
        <CampaignList
          id="campaigns-heading"
          title="Ending this week"
          empty="Nothing live ends in the next seven days."
          lines={data.endingSoon}
          when={(line) => `Ends ${FORMAT.format(new Date(line.endsAt))}`}
        />
        <CampaignList
          title="Starting this week"
          empty="Nothing is scheduled to start in the next seven days."
          lines={data.startingSoon}
          when={(line) => `Starts ${FORMAT.format(new Date(line.startsAt))}`}
        />
      </section>

      {/* ------------------------------------------------------ site-wide */}
      <section aria-labelledby="site-heading">
        <SectionTitle id="site-heading" icon={<Megaphone className="size-4" aria-hidden />} title="Site-wide" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          <Tile href="/admin/coupons" icon={<Ticket />} title="Coupons" line={`${data.coupons.live} live · ${data.coupons.expired} expired`} />
          <Tile href="/admin/promotions" icon={<BadgePercent />} title="Promotions" line={`${data.promotions.live} live · ${data.promotions.expired} expired`} />
          <Tile
            href="/admin/appearance"
            icon={<Palette />}
            title="Appearance"
            line={data.site.stripShowing ? `Strip showing ${data.site.activeAnnouncements} offers` : 'Promotion strip hidden'}
          />
          <Tile
            href="/admin/page-chrome"
            icon={<PanelsTopLeft />}
            title="Page layout"
            line={data.site.hiddenFrameRules === 0 ? 'Full frame on every page' : `${data.site.hiddenFrameRules} pieces hidden on some pages`}
          />
          <Tile
            href="/admin/pages"
            icon={<FileText />}
            title="Content pages"
            line={`${data.content.published} published · ${data.content.drafts} drafts`}
          />
        </div>
      </section>
    </div>
  );
}

function SectionTitle({ id, icon, title }: { id: string; icon: React.ReactNode; title: string }) {
  return (
    <h2 id={id} className="text-ink mb-3 flex items-center gap-2 text-sm font-semibold">
      <span className="text-muted">{icon}</span>
      {title}
    </h2>
  );
}

function Pill({ tone, children }: { tone: 'warning' | 'info'; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'rounded-full px-2 py-0.5 text-2xs font-medium',
        tone === 'warning' ? 'bg-warning-50 text-warning-700' : 'bg-info-50 text-info-700',
      )}
    >
      {children}
    </span>
  );
}

function CampaignList({
  id,
  title,
  empty,
  lines,
  when,
}: {
  id?: string;
  title: string;
  empty: string;
  lines: CampaignLine[];
  when: (line: CampaignLine) => string;
}) {
  return (
    <div>
      <h2 id={id} className="text-ink mb-3 flex items-center gap-2 text-sm font-semibold">
        <CalendarClock className="text-muted size-4" aria-hidden />
        {title}
      </h2>
      <div className="border-line bg-raised rounded-lg border">
        {lines.length === 0 ? (
          <p className="text-muted px-4 py-6 text-sm sm:px-5">{empty}</p>
        ) : (
          <ul className="divide-line divide-y">
            {lines.map((line) => (
              <li key={`${line.kind}-${line.id}`}>
                <Link
                  href={line.kind === 'coupon' ? '/admin/coupons' : '/admin/promotions'}
                  className="hover:bg-sunken/60 flex items-center gap-3 px-4 py-2.5 sm:px-5"
                >
                  <span className="bg-sunken text-muted rounded px-1.5 py-0.5 text-2xs font-medium uppercase">
                    {line.kind}
                  </span>
                  <span className="text-ink min-w-0 flex-1 truncate text-sm font-medium">{line.label}</span>
                  <span className="text-muted shrink-0 text-xs">{when(line)}</span>
                  <span className="sr-only">{CAMPAIGN_STATUS_LABEL[line.status]}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Tile({ href, icon, title, line }: { href: string; icon: React.ReactNode; title: string; line: string }) {
  return (
    <Link
      href={href}
      className="border-line bg-raised hover:border-ink/30 group flex flex-col gap-2 rounded-lg border p-4 transition-colors"
    >
      <span className="text-accent-ink [&>svg]:size-5" aria-hidden>
        {icon}
      </span>
      <span className="text-ink text-sm font-semibold">{title}</span>
      <span className="text-muted text-xs">{line}</span>
    </Link>
  );
}

function OverviewSkeleton() {
  return (
    <div className="mt-6 space-y-8" aria-hidden>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="skeleton h-28 rounded-lg" />
        ))}
      </div>
      <div className="skeleton h-40 rounded-lg" />
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="skeleton h-48 rounded-lg" />
        <div className="skeleton h-48 rounded-lg" />
      </div>
    </div>
  );
}
