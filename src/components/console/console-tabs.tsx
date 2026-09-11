import { Tabs, type TabItem } from '@/components/ui/tabs';

/**
 * Filter tabs for a console list.
 *
 * Now a thin adapter over `ui/tabs`, which owns the look, the touch minimum and
 * the `aria-current` semantics. This kept its own copy of all three until Phase
 * 24, which is how its tabs ended up 31px tall on a phone while the storefront's
 * were not.
 *
 * The URL shape stays here because it is the part that differs: a console list
 * filters on one query parameter and resets to page one implicitly by dropping
 * every other parameter.
 */
export function ConsoleTabs({
  basePath,
  param,
  current,
  tabs,
}: {
  basePath: string;
  param: string;
  current: string;
  tabs: TabItem[];
}) {
  return (
    <Tabs
      items={tabs}
      current={current}
      href={(value) => `${basePath}?${param}=${value}`}
    />
  );
}
