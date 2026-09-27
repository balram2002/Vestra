import 'server-only';

import { cookies } from 'next/headers';

import {
  armFor,
  EXPOSURE_COOKIE,
  parseExposures,
  serialiseExposures,
  variantFor,
  VISITOR_COOKIE,
  type Arm,
  type RunningExperiment,
} from '@/domain/experiments';

import { countConversion } from './experiments';

/**
 * The visitor's side of an A/B test: which arm they are in, and crediting
 * what they do afterwards to the arms they were shown.
 *
 * Reading cookies makes a render dynamic, so `visitorArm` is only ever called
 * inside the page's own `<Suspense>` island, and only while a test runs.
 */

const EXPOSURE_MAX_AGE = 60 * 60 * 24 * 30;

export async function visitorArm(experiment: RunningExperiment): Promise<{ arm: Arm; variant: string; counted: boolean }> {
  const visitor = (await cookies()).get(VISITOR_COOKIE)?.value;
  // No id (cookies refused, or a crawler): the control, and not counted --
  // an arm nobody can be held to would only add noise.
  if (!visitor) return { arm: 'A', variant: experiment.control, counted: false };
  const arm = armFor(visitor, experiment.id, experiment.split);
  return { arm, variant: variantFor(experiment, arm), counted: true };
}

/**
 * Credit a bag add or an order to every running test this visitor was shown.
 * A bag add counts once per visitor per test (the rate is "visitors who added
 * anything"); every order counts, with its value. Only from server actions,
 * which may write the cookie; never throws, because a counter must not break
 * a purchase.
 */
export async function creditConversion(kind: 'addedToBag' | 'order', revenue = 0): Promise<void> {
  try {
    const jar = await cookies();
    const exposures = parseExposures(jar.get(EXPOSURE_COOKIE)?.value);
    if (exposures.length === 0) return;

    let changed = false;
    for (const exposure of exposures) {
      if (kind === 'addedToBag') {
        if (exposure.b) continue;
        exposure.b = 1;
        changed = true;
      }
      await countConversion(exposure.i, exposure.a, kind, revenue);
    }
    if (changed) {
      jar.set(EXPOSURE_COOKIE, serialiseExposures(exposures), {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: EXPOSURE_MAX_AGE,
      });
    }
  } catch (error) {
    console.error('[experiments] could not credit a conversion', error);
  }
}

export { EXPOSURE_MAX_AGE };
