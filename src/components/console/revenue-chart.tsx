'use client';

import { useId } from 'react';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { cn } from '@/lib/cn';
import { formatDateShort, formatMoney, formatMoneyCompact } from '@/lib/format';

/**
 * Daily revenue.
 *
 * Design decisions, and why:
 *
 *  - AREA over time, not bars. The question is shape — is it growing, is there
 *    a weekly rhythm — and a filled line answers that at a glance where 30 bars
 *    become a picket fence.
 *  - ONE series, so no legend: the section heading already names it. A legend
 *    box for a single line is noise.
 *  - ONE axis. Orders-per-day is a second measure on a different scale and is
 *    deliberately NOT plotted here; it appears in the tooltip instead, where it
 *    adds context without implying a shared scale.
 *  - Recessive grid: horizontal rules only, no vertical ones, no axis lines.
 *    The data should be the darkest thing in the frame.
 *  - Colour comes from the design tokens rather than a hex, so the chart tracks
 *    the theme instead of being repainted for dark mode.
 */

export interface RevenuePoint {
  date: string;
  revenue: number;
  orders: number;
}

export function RevenueChart({
  data,
  className,
}: {
  data: RevenuePoint[];
  className?: string;
}) {
  const gradientId = useId();
  const hasRevenue = data.some((point) => point.revenue > 0);

  if (!hasRevenue) {
    return (
      <div
        className={cn(
          'border-line text-muted flex h-56 items-center justify-center rounded-md border border-dashed text-sm',
          className,
        )}
      >
        No revenue in this period yet.
      </div>
    );
  }

  return (
    <div className={cn('h-56 w-full', className)}>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -12 }}>
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--color-mulberry-500)" stopOpacity={0.22} />
              <stop offset="100%" stopColor="var(--color-mulberry-500)" stopOpacity={0.02} />
            </linearGradient>
          </defs>

          <CartesianGrid
            vertical={false}
            stroke="var(--color-bone-200)"
            strokeDasharray="2 4"
          />

          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            // Roughly six labels regardless of range, so they never collide.
            interval={Math.max(0, Math.floor(data.length / 6) - 1)}
            tick={{ fontSize: 11, fill: 'var(--color-bone-500)' }}
            tickFormatter={(value: string) => formatDateShort(value)}
          />

          <YAxis
            tickLine={false}
            axisLine={false}
            width={64}
            tick={{ fontSize: 11, fill: 'var(--color-bone-500)' }}
            tickFormatter={(value: number) => formatMoneyCompact(value)}
          />

          <Tooltip
            cursor={{ stroke: 'var(--color-bone-400)', strokeWidth: 1, strokeDasharray: '3 3' }}
            content={<RevenueTooltip />}
          />

          <Area
            type="monotone"
            dataKey="revenue"
            stroke="var(--color-mulberry-600)"
            strokeWidth={2}
            fill={`url(#${gradientId})`}
            // Dots on 30 points is clutter; the active dot on hover is enough.
            dot={false}
            activeDot={{
              r: 4,
              strokeWidth: 2,
              stroke: 'var(--color-bone-0)',
              fill: 'var(--color-mulberry-600)',
            }}
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

interface TooltipPayload {
  payload?: Array<{ payload: RevenuePoint }>;
  active?: boolean;
}

/**
 * Custom tooltip.
 *
 * Carries the second measure (orders) that is deliberately absent from the
 * plot, plus the derived average order value — the number a seller actually
 * wants when they hover a spike and ask "was that volume or basket size?".
 */
function RevenueTooltip({ active, payload }: TooltipPayload) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  return (
    <div className="border-line bg-raised rounded-md border px-3 py-2 shadow-md">
      <p className="text-faint text-2xs uppercase tracking-wider">
        {formatDateShort(point.date)}
      </p>
      <p className="text-ink tabular mt-1 text-sm font-semibold">{formatMoney(point.revenue)}</p>
      <p className="text-muted tabular mt-0.5 text-xs">
        {point.orders} {point.orders === 1 ? 'order' : 'orders'}
        {point.orders > 0 ? ` · ${formatMoney(Math.round(point.revenue / point.orders))} avg` : ''}
      </p>
    </div>
  );
}
