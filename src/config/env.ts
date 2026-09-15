import { z } from 'zod';

/**
 * The environment, checked once when the server starts.
 *
 * Modules still read `process.env` where they need a value. This exists so a
 * misconfigured deployment refuses to start with a list of what is wrong,
 * instead of starting and failing on the first order, or worse, quietly
 * running a mock: every provider here falls back to a simulation when its
 * secrets are missing, which is right on a laptop and a disaster in
 * production.
 *
 * Strictness comes from APP_ENV, not NODE_ENV. `next start` always sets
 * NODE_ENV=production, including on a developer's machine running the
 * production build locally; APP_ENV says where the code is actually deployed.
 *
 *   development   problems are printed, nothing is refused
 *   staging       problems refuse to start; mocks are warned about
 *   production    problems refuse to start, and so do mocks
 */

const text = z.string().optional();

const schema = z.object({
  APP_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  NEXT_PUBLIC_SITE_URL: z.string().url('NEXT_PUBLIC_SITE_URL must be a full URL, with its scheme'),
  AUTH_SECRET: z.string().min(32, 'AUTH_SECRET must be at least 32 characters'),
  MONGODB_URI: z
    .string()
    .regex(/^mongodb(\+srv)?:\/\//, 'MONGODB_URI must start with mongodb:// or mongodb+srv://'),
  PAYMENT_PROVIDER: z.enum(['mock', 'razorpay', 'stripe']).default('mock'),
  LIVE_PROVIDER: z.enum(['mock', 'zoom']).default('mock'),
  SHIPPING_PROVIDER: text,
  ESHOPBOX_MODE: text,
  SMTP_HOST: text,
  GOOGLE_CLIENT_ID: text,
  GOOGLE_CLIENT_SECRET: text,
});

export interface EnvReport {
  stage: 'development' | 'staging' | 'production';
  errors: string[];
  warnings: string[];
}

export function checkEnv(env: Record<string, string | undefined> = process.env): EnvReport {
  const parsed = schema.safeParse(env);
  const stage = (['staging', 'production'] as const).find((value) => value === env.APP_ENV) ?? 'development';

  if (!parsed.success) {
    return {
      stage,
      errors: parsed.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
      warnings: [],
    };
  }

  const e = parsed.data;
  const errors: string[] = [];
  const warnings: string[] = [];
  const strict = stage !== 'development';

  if (Boolean(e.GOOGLE_CLIENT_ID) !== Boolean(e.GOOGLE_CLIENT_SECRET)) {
    errors.push('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured together');
  }

  const requireAll = (when: boolean, keys: string[], why: string) => {
    if (!when) return;
    for (const key of keys) if (!env[key]) errors.push(`${key} is required ${why}`);
  };

  // A provider selected without its secrets silently becomes a mock.
  requireAll(
    e.PAYMENT_PROVIDER === 'razorpay',
    ['RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'],
    'when PAYMENT_PROVIDER=razorpay',
  );
  requireAll(
    e.PAYMENT_PROVIDER === 'stripe',
    ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'],
    'when PAYMENT_PROVIDER=stripe',
  );
  requireAll(
    e.LIVE_PROVIDER === 'zoom',
    ['ZOOM_ACCOUNT_ID', 'ZOOM_CLIENT_ID', 'ZOOM_CLIENT_SECRET'],
    'when LIVE_PROVIDER=zoom',
  );
  const eshopboxLive = (e.SHIPPING_PROVIDER ?? 'eshopbox') === 'eshopbox' && e.ESHOPBOX_MODE !== 'simulation';
  requireAll(
    eshopboxLive && strict,
    ['ESHOPBOX_CLIENT_ID', 'ESHOPBOX_CLIENT_SECRET', 'ESHOPBOX_REFRESH_TOKEN', 'ESHOPBOX_WORKSPACE', 'ESHOPBOX_WEBHOOK_SECRET'],
    'for live shipping (set ESHOPBOX_MODE=simulation to simulate on purpose)',
  );

  // Vercel's disk is read-only and not shared between instances, so uploads
  // have nowhere to go without ImageKit.
  const imageKit = ['NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT', 'NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY', 'IMAGEKIT_PRIVATE_KEY'];
  if (env.VERCEL === '1' && imageKit.some((key) => !env[key])) {
    (strict ? errors : warnings).push('ImageKit is required on Vercel: uploads cannot be stored on its read-only disk');
  }

  // How shoppers reach a person, and the grievance officer Indian e-commerce
  // rules require a marketplace to name. Neither is invented when unset, so a
  // deployment is told instead.
  if (strict || env.VERCEL === '1') {
    if (!env.NEXT_PUBLIC_SUPPORT_EMAIL) {
      warnings.push('NEXT_PUBLIC_SUPPORT_EMAIL is empty: the footer, the contact page and emails show no support address');
    }
    if (!env.NEXT_PUBLIC_GRIEVANCE_OFFICER) {
      warnings.push('NEXT_PUBLIC_GRIEVANCE_OFFICER is empty: the grievance page names no officer, which the E-Commerce Rules require');
    }
  }

  if (strict) {
    if (/dev-only|change-me/i.test(e.AUTH_SECRET)) {
      errors.push('AUTH_SECRET is still the development placeholder');
    }
    const live = stage === 'production' ? errors : warnings;
    if (e.PAYMENT_PROVIDER === 'mock') live.push('PAYMENT_PROVIDER=mock: orders would be "paid" by a simulated gateway');
    if (!e.SMTP_HOST) live.push('SMTP_HOST is empty: order and password emails would not be sent');
    if (!e.NEXT_PUBLIC_SITE_URL.startsWith('https://')) live.push('NEXT_PUBLIC_SITE_URL is not https');
    if (e.LIVE_PROVIDER === 'mock') warnings.push('LIVE_PROVIDER=mock: live calls open the demo room');
  }

  return { stage, errors, warnings };
}
