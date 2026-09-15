import { describe, expect, it } from 'vitest';

import { checkEnv } from './env';

/*
 * The startup check decides whether a production server is allowed to start,
 * so its rules are pinned here: strict where a mistake would take real money
 * or send no email, and quiet on a developer's machine.
 */

const complete = {
  NEXT_PUBLIC_SITE_URL: 'https://shop.example.com',
  AUTH_SECRET: 'a'.repeat(40),
  MONGODB_URI: 'mongodb://127.0.0.1:27017',
  SMTP_HOST: 'smtp.example.com',
  PAYMENT_PROVIDER: 'razorpay',
  RAZORPAY_KEY_ID: 'key',
  RAZORPAY_KEY_SECRET: 'secret',
  RAZORPAY_WEBHOOK_SECRET: 'webhook',
  ESHOPBOX_MODE: 'simulation',
};

describe('checkEnv', () => {
  it('lets development run with problems, as warnings at most', () => {
    const report = checkEnv({ ...complete, APP_ENV: 'development', PAYMENT_PROVIDER: 'mock', SMTP_HOST: '' });
    expect(report.stage).toBe('development');
    expect(report.errors).toEqual([]);
  });

  it('accepts a complete production configuration', () => {
    expect(checkEnv({ ...complete, APP_ENV: 'production' }).errors).toEqual([]);
  });

  it('refuses the development AUTH_SECRET outside development', () => {
    const report = checkEnv({
      ...complete,
      APP_ENV: 'staging',
      AUTH_SECRET: 'dev-only-insecure-secret-change-me-in-every-real-environment',
    });
    expect(report.errors.join(' ')).toMatch(/placeholder/);
  });

  it('refuses mock payments, missing SMTP and plain http in production', () => {
    const errors = checkEnv({
      ...complete,
      APP_ENV: 'production',
      PAYMENT_PROVIDER: 'mock',
      SMTP_HOST: '',
      NEXT_PUBLIC_SITE_URL: 'http://shop.example.com',
    }).errors.join(' ');
    expect(errors).toMatch(/PAYMENT_PROVIDER=mock/);
    expect(errors).toMatch(/SMTP_HOST/);
    expect(errors).toMatch(/not https/);
  });

  it('only warns about a mock gateway in staging', () => {
    const report = checkEnv({ ...complete, APP_ENV: 'staging', PAYMENT_PROVIDER: 'mock' });
    expect(report.errors).toEqual([]);
    expect(report.warnings.join(' ')).toMatch(/PAYMENT_PROVIDER=mock/);
  });

  it('requires the secrets of a selected provider in every stage', () => {
    const report = checkEnv({ ...complete, APP_ENV: 'development', RAZORPAY_KEY_SECRET: '' });
    expect(report.errors).toContain('RAZORPAY_KEY_SECRET is required when PAYMENT_PROVIDER=razorpay');
  });

  it('requires both Google OAuth credentials when either is configured', () => {
    const report = checkEnv({ ...complete, APP_ENV: 'production', GOOGLE_CLIENT_ID: 'client-id' });
    expect(report.errors).toContain('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be configured together');
    expect(
      checkEnv({
        ...complete,
        APP_ENV: 'production',
        GOOGLE_CLIENT_ID: 'client-id',
        GOOGLE_CLIENT_SECRET: 'client-secret',
      }).errors,
    ).toEqual([]);
  });

  it('requires Eshopbox credentials for live shipping outside development', () => {
    const report = checkEnv({ ...complete, APP_ENV: 'production', ESHOPBOX_MODE: '' });
    expect(report.errors.some((error) => error.startsWith('ESHOPBOX_CLIENT_ID'))).toBe(true);
  });

  it('reports a malformed value instead of throwing', () => {
    const report = checkEnv({ ...complete, APP_ENV: 'production', MONGODB_URI: 'postgres://nope' });
    expect(report.errors[0]).toMatch(/MONGODB_URI/);
  });

  it('requires ImageKit on Vercel outside development', () => {
    const imageKit = {
      NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT: 'https://ik.imagekit.io/shop',
      NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY: 'public',
      IMAGEKIT_PRIVATE_KEY: 'private',
    };
    const without = checkEnv({ ...complete, APP_ENV: 'production', VERCEL: '1' });
    expect(without.errors.join(' ')).toMatch(/ImageKit is required on Vercel/);
    expect(checkEnv({ ...complete, ...imageKit, APP_ENV: 'production', VERCEL: '1' }).errors).toEqual([]);
  });
});
