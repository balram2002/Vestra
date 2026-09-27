import { ArrowRight, FlaskConical } from 'lucide-react';
import Link from 'next/link';

import { Card } from '@/components/ui/card';
import { compareArms, type Experiment } from '@/domain/experiments';
import { designFor, isPageDesignKey } from '@/domain/page-designs';
import { cn } from '@/lib/cn';
import { formatDate, formatPercent } from '@/lib/format';

/**
 * A/B tests on page designs, for Analytics: what is running, what was
 * learned, and where to act on it. The verdict is the same one the designer
 * shows, from the same function, so the two screens cannot disagree.
 */
export function ExperimentSummary({ experiments }: { experiments: Experiment[] }) {
  const known = experiments.filter((experiment) => isPageDesignKey(experiment.page));
  if (known.length === 0) return null;

  return (
    <Card as="section">
      <h2 className="text-ink inline-flex items-center gap-1.5 text-md font-semibold">
        <FlaskConical className="size-4" aria-hidden />
        A/B tests
      </h2>
      <p className="text-muted mt-1 text-xs">
        Layouts tested against each other under Marketing › Page designs. Add to bag is the headline measure; a winner is
        called only with enough visitors and 95% confidence.
      </p>
      <ul className="divide-line mt-4 divide-y">
        {known.map((experiment) => {
          const definition = designFor(experiment.page as Parameters<typeof designFor>[0]);
          const name = (variant: string) => definition.variantMeta[variant]?.name ?? variant;
          const result = compareArms(experiment.arms.A, experiment.arms.B, 'addedToBag');
          const visitors = experiment.arms.A.visitors + experiment.arms.B.visitors;
          const verdict =
            result.verdict === 'COLLECTING'
              ? experiment.status === 'RUNNING'
                ? 'Collecting'
                : 'Ended too early to call'
              : result.verdict === 'NO_CLEAR_DIFFERENCE'
                ? 'No clear difference'
                : `${name(result.verdict === 'B_AHEAD' ? experiment.challenger : experiment.control)} ahead, ${formatPercent(result.confidence * 100, 0)} confident`;
          return (
            <li key={experiment.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3">
              <span
                className={cn(
                  'text-2xs rounded-full px-2 py-0.5 font-semibold uppercase tracking-wide',
                  experiment.status === 'RUNNING' ? 'bg-success-50 text-success-900' : 'bg-sunken text-muted',
                )}
              >
                {experiment.status === 'RUNNING' ? 'Running' : 'Ended'}
              </span>
              <span className="min-w-0 flex-1">
                <span className="text-ink block text-sm font-medium">
                  {definition.title}: {name(experiment.control)} vs {name(experiment.challenger)}
                </span>
                <span className="text-muted block text-xs">
                  Since {formatDate(experiment.startedAt)} · {visitors} visitors · add to bag {formatPercent(result.rateA * 100)} vs{' '}
                  {formatPercent(result.rateB * 100)}
                </span>
              </span>
              <span className="text-ink text-xs font-medium">{verdict}</span>
              <Link href={`/admin/design/${experiment.page}`} className="text-accent-ink inline-flex min-h-10 items-center gap-1 text-xs font-medium">
                Open <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
