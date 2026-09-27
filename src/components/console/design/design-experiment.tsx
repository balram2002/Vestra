'use client';

import { FlaskConical, RefreshCw } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { Button } from '@/components/ui/button';
import {
  compareArms,
  CONFIDENCE_TO_CALL,
  type Arm,
  type ArmStats,
  type Comparison,
  type Experiment,
} from '@/domain/experiments';
import type { PageDesignDefinition, PageDesignState } from '@/domain/page-designs/types';
import { cn } from '@/lib/cn';
import { formatDate, formatMoney, formatPercent } from '@/lib/format';
import { designStateAfterTest, endTest, experimentsFor, startTest } from '@/server/actions/experiments';

const SPLITS = [10, 20, 30, 40, 50];

const pct = (rate: number) => formatPercent(rate * 100, 1);

/**
 * Split shoppers between the live layout and one other, and see which sells
 * better. The verdict waits for enough visitors and a clear difference;
 * until then the panel says it is collecting, because an early lead is the
 * number most likely to be acted on and most likely to reverse.
 */
export function DesignExperiment({
  page,
  definition,
  liveVariant,
  initial,
  onDesignChanged,
}: {
  page: string;
  definition: PageDesignDefinition;
  liveVariant: string;
  initial: Experiment[];
  onDesignChanged: (state: PageDesignState) => void;
}) {
  const [experiments, setExperiments] = useState(initial);
  const running = experiments.find((experiment) => experiment.status === 'RUNNING') ?? null;
  const past = experiments.filter((experiment) => experiment.status === 'ENDED');
  const candidates = definition.variants.filter((variant) => variant !== liveVariant);
  const [challenger, setChallenger] = useState(candidates[0] ?? '');
  const [split, setSplit] = useState(50);
  const [confirming, setConfirming] = useState<'keep' | 'publish' | null>(null);
  const [pending, start] = useTransition();
  const name = (variant: string) => definition.variantMeta[variant]?.name ?? variant;

  const refresh = () =>
    start(async () => {
      setExperiments(await experimentsFor(page));
    });

  const begin = () =>
    start(async () => {
      const result = await startTest({ page, challenger, split });
      if (!result.ok) return void toast.error(result.error);
      setExperiments(result.experiments);
      toast.success(`Testing ${name(challenger)} against ${name(liveVariant)}`);
    });

  const finish = (publishChallenger: boolean) =>
    start(async () => {
      if (!running) return;
      const result = await endTest({ page, id: running.id, publishChallenger });
      setConfirming(null);
      if (!result.ok) return void toast.error(result.error);
      setExperiments(result.experiments);
      if (publishChallenger) {
        const state = await designStateAfterTest(page);
        if (state) onDesignChanged(state);
        toast.success(`${name(running.challenger)} is now live for everyone`);
      } else {
        toast.success(`Test ended. ${name(running.control)} stays live`);
      }
    });

  return (
    <section className="border-line bg-raised rounded-lg border" aria-labelledby="ab-test">
      <header className="border-line flex flex-wrap items-start justify-between gap-3 border-b px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <h2 id="ab-test" className="text-ink inline-flex items-center gap-1.5 text-sm font-semibold">
            <FlaskConical className="size-4" aria-hidden />
            A/B test
          </h2>
          <p className="text-muted mt-0.5 text-xs">
            Show part of your shoppers another layout, with the live settings for each, and compare what they do. Each
            shopper keeps the same layout on every visit.
          </p>
        </div>
        {running ? (
          <Button type="button" size="xs" variant="ghost" disabled={pending} onClick={refresh}>
            <RefreshCw className={cn('size-3.5', pending && 'animate-spin')} aria-hidden />
            Refresh numbers
          </Button>
        ) : null}
      </header>

      <div className="p-4 sm:p-5">
        {running ? (
          <RunningTest
            experiment={running}
            name={name}
            pending={pending}
            confirming={confirming}
            onConfirm={setConfirming}
            onFinish={finish}
          />
        ) : candidates.length === 0 ? (
          <p className="text-muted text-sm">This page has only one layout, so there is nothing to test.</p>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <label className="min-w-0 flex-1">
              <span className="text-ink mb-1 block text-xs font-medium">Test this layout</span>
              <select className="border-line bg-raised text-ink h-9 w-full rounded-sm border px-2 text-sm" value={challenger} onChange={(event) => setChallenger(event.target.value)}>
                {candidates.map((variant) => (
                  <option key={variant} value={variant}>
                    Variant {definition.variantMeta[variant].number} · {name(variant)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="text-ink mb-1 block text-xs font-medium">Shoppers who see it</span>
              <select className="border-line bg-raised text-ink h-9 rounded-sm border px-2 text-sm" value={split} onChange={(event) => setSplit(Number(event.target.value))}>
                {SPLITS.map((value) => (
                  <option key={value} value={value}>
                    {value}%
                  </option>
                ))}
              </select>
            </label>
            <Button type="button" size="sm" disabled={pending || !challenger} onClick={begin}>
              <FlaskConical className="size-4" aria-hidden />
              Start test
            </Button>
            <p className="text-faint w-full text-xs">
              The rest see {name(liveVariant)}, the live layout. While the test runs the page’s layout cannot change;
              settings can, and apply to both. Stores and categories with a layout of their own stay out of it.
            </p>
          </div>
        )}

        {past.length ? (
          <div className="border-line mt-5 border-t pt-4">
            <h3 className="text-faint text-2xs font-semibold uppercase tracking-wider">Earlier tests</h3>
            <ul className="mt-2 space-y-1.5">
              {past.map((experiment) => {
                const result = compareArms(experiment.arms.A, experiment.arms.B, 'addedToBag');
                return (
                  <li key={experiment.id} className="text-muted text-xs">
                    <span className="text-ink font-medium">
                      {name(experiment.control)} vs {name(experiment.challenger)}
                    </span>{' '}
                    · {formatDate(experiment.startedAt)} to {experiment.endedAt ? formatDate(experiment.endedAt) : '…'} ·{' '}
                    {experiment.arms.A.visitors + experiment.arms.B.visitors} visitors · {verdictLine(result, experiment, name)} ·{' '}
                    {experiment.outcome === 'PUBLISHED_CHALLENGER' ? `${name(experiment.challenger)} published` : `${name(experiment.control)} kept`}
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function RunningTest({
  experiment,
  name,
  pending,
  confirming,
  onConfirm,
  onFinish,
}: {
  experiment: Experiment;
  name: (variant: string) => string;
  pending: boolean;
  confirming: 'keep' | 'publish' | null;
  onConfirm: (value: 'keep' | 'publish' | null) => void;
  onFinish: (publishChallenger: boolean) => void;
}) {
  const bag = compareArms(experiment.arms.A, experiment.arms.B, 'addedToBag');
  const orders = compareArms(experiment.arms.A, experiment.arms.B, 'orders');
  const rows: Array<{ arm: Arm; variant: string; share: number; stats: ArmStats }> = [
    { arm: 'A', variant: experiment.control, share: 100 - experiment.split, stats: experiment.arms.A },
    { arm: 'B', variant: experiment.challenger, share: experiment.split, stats: experiment.arms.B },
  ];

  return (
    <div>
      <p className="text-muted text-xs" role="status">
        <span className="bg-success-500 mr-1.5 inline-block size-2 animate-pulse rounded-full align-middle motion-reduce:animate-none" aria-hidden />
        Running since {formatDate(experiment.startedAt)}, started by {experiment.startedByName}.
      </p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[32rem] text-sm">
          <thead>
            <tr className="text-faint text-2xs text-left uppercase tracking-wider">
              <th className="py-1.5 pr-3 font-semibold">Layout</th>
              <th className="px-3 py-1.5 text-right font-semibold">Visitors</th>
              <th className="px-3 py-1.5 text-right font-semibold">Added to bag</th>
              <th className="px-3 py-1.5 text-right font-semibold">Ordered</th>
              <th className="py-1.5 pl-3 text-right font-semibold">Revenue / visitor</th>
            </tr>
          </thead>
          <tbody className="divide-line divide-y">
            {rows.map((row) => (
              <tr key={row.arm}>
                <td className="py-2 pr-3">
                  <span className="text-ink font-medium">
                    {row.arm} · {name(row.variant)}
                  </span>
                  <span className="text-faint block text-xs">
                    {row.arm === 'A' ? 'Live layout' : 'Challenger'} · {row.share}% of shoppers
                  </span>
                </td>
                <td className="text-ink px-3 py-2 text-right tabular-nums">{row.stats.visitors}</td>
                <td className="text-ink px-3 py-2 text-right tabular-nums">{pct(row.arm === 'A' ? bag.rateA : bag.rateB)}</td>
                <td className="text-ink px-3 py-2 text-right tabular-nums">{pct(row.arm === 'A' ? orders.rateA : orders.rateB)}</td>
                <td className="text-ink py-2 pl-3 text-right tabular-nums">
                  {row.stats.visitors ? formatMoney(Math.round(row.stats.revenue / row.stats.visitors)) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2">
        <Verdict label="Add to bag" result={bag} experiment={experiment} name={name} />
        <Verdict label="Orders" result={orders} experiment={experiment} name={name} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {confirming ? (
          <>
            <Button type="button" size="sm" variant={confirming === 'publish' ? 'primary' : 'secondary'} disabled={pending} onClick={() => onFinish(confirming === 'publish')}>
              {confirming === 'publish' ? `Yes, publish ${name(experiment.challenger)} for everyone` : `Yes, end and keep ${name(experiment.control)}`}
            </Button>
            <Button type="button" size="sm" variant="ghost" disabled={pending} onClick={() => onConfirm(null)}>
              Not yet
            </Button>
          </>
        ) : (
          <>
            <Button type="button" size="sm" variant="secondary" disabled={pending} onClick={() => onConfirm('keep')}>
              End test, keep {name(experiment.control)}
            </Button>
            <Button type="button" size="sm" disabled={pending} onClick={() => onConfirm('publish')}>
              Publish {name(experiment.challenger)} and end
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function verdictLine(result: Comparison, experiment: Experiment, name: (variant: string) => string): string {
  switch (result.verdict) {
    case 'COLLECTING':
      return `too few visitors to call`;
    case 'NO_CLEAR_DIFFERENCE':
      return 'no clear difference';
    case 'B_AHEAD':
      return `${name(experiment.challenger)} ahead`;
    case 'A_AHEAD':
      return `${name(experiment.control)} ahead`;
  }
}

function Verdict({
  label,
  result,
  experiment,
  name,
}: {
  label: string;
  result: Comparison;
  experiment: Experiment;
  name: (variant: string) => string;
}) {
  const winner = result.verdict === 'B_AHEAD' ? experiment.challenger : result.verdict === 'A_AHEAD' ? experiment.control : null;
  const lift = result.lift === null ? null : Math.abs(result.lift) * 100;
  return (
    <div
      className={cn(
        'rounded-md border px-3 py-2 text-xs',
        winner ? 'border-success-300 bg-success-50 text-success-900' : 'border-line bg-sunken text-muted',
      )}
    >
      <p className="font-semibold">{label}</p>
      <p className="mt-0.5">
        {result.verdict === 'COLLECTING'
          ? `Collecting: ${result.visitorsNeeded} more ${result.visitorsNeeded === 1 ? 'visitor' : 'visitors'} in the smaller group before any verdict.`
          : result.verdict === 'NO_CLEAR_DIFFERENCE'
            ? `No clear difference yet (${formatPercent(result.confidence * 100, 0)} confident; a verdict needs ${formatPercent(CONFIDENCE_TO_CALL * 100, 0)}).`
            : `${name(winner!)} is ahead${lift !== null ? ` by ${formatPercent(lift, 0)}` : ''}, ${formatPercent(result.confidence * 100, 0)} confident.`}
      </p>
    </div>
  );
}
