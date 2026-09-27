import type { RunningExperiment } from '@/domain/experiments';
import { visitorArm } from '@/server/services/experiment-visitor';

import { ExposureBeacon } from './exposure-beacon';

/**
 * Renders a page in the layout this visitor's arm of a running test calls
 * for.
 *
 * Reads the visitor's cookie, so it must sit inside the route's own
 * `<Suspense>`: while a test runs the page's LAYOUT renders per visitor, but
 * everything it draws with -- products, stores, settings -- still comes from
 * cache. Pages with no running test never reach this component.
 */
export async function ExperimentArm({
  experiment,
  children,
}: {
  experiment: RunningExperiment;
  children: (variant: string) => React.ReactNode;
}) {
  const { variant, counted } = await visitorArm(experiment);
  return (
    <>
      {children(variant)}
      {counted ? <ExposureBeacon experimentId={experiment.id} /> : null}
    </>
  );
}
