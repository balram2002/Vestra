import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import type { SetupItem } from '@/server/services/onboarding';

/**
 * What a new store still has to add, and why each thing matters.
 *
 * The application asks for business details only, so an approved store starts
 * without a pickup address, tax numbers or a bank account. This is where that
 * is made visible: at the top of the dashboard, each item saying what it
 * unlocks, and gone entirely once everything is in.
 */
export function SetupChecklist({ items }: { items: SetupItem[] }) {
  const todo = items.filter((item) => !item.done);
  if (todo.length === 0) return null;

  return (
    <section
      aria-labelledby="setup-title"
      className="border-accent-border bg-accent-soft rounded-lg border p-4 sm:p-5"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="setup-title" className="text-ink text-md font-semibold">
          Finish setting up your store
        </h2>
        <p className="text-muted tabular text-xs">
          {items.length - todo.length} of {items.length} done
        </p>
      </div>

      <ul className="mt-3 grid gap-2 sm:grid-cols-2">
        {todo.map((item) => (
          <li key={item.key}>
            <Link
              href={item.href}
              className="border-line bg-raised hover:border-accent-control group flex h-full items-start gap-3 rounded-md border p-3 transition-colors"
            >
              <span aria-hidden className="border-line-strong mt-0.5 size-4 shrink-0 rounded-full border" />
              <span className="min-w-0 flex-1">
                <span className="text-ink block text-sm font-medium">{item.label}</span>
                <span className="text-muted mt-0.5 block text-xs">{item.why}</span>
              </span>
              <ArrowRight
                className="text-faint mt-0.5 size-4 shrink-0 transition-transform group-hover:translate-x-0.5"
                aria-hidden
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
