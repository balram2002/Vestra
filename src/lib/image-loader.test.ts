import { readFileSync } from 'node:fs';

import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The `next/image` loader.
 *
 * Registered as `loaderFile`, so it REPLACES Next's optimiser rather than
 * sitting beside it — which means a mistake here breaks every image in the app
 * at once, in both the configured and unconfigured states.
 */

const ENDPOINT = 'https://ik.imagekit.io/vestra';

async function load(configured: boolean) {
  vi.resetModules();
  if (configured) {
    process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT = ENDPOINT;
    process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY = 'public_test';
  } else {
    delete process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT;
    delete process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY;
  }
  return import('./image-loader');
}

const original = {
  endpoint: process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT,
  key: process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY,
};

afterEach(() => {
  if (original.endpoint === undefined) delete process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT;
  else process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT = original.endpoint;
  if (original.key === undefined) delete process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY;
  else process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY = original.key;
});

describe('with ImageKit configured', () => {
  it('serves every source from ImageKit at the requested width', async () => {
    const { default: loader } = await load(true);
    expect(loader({ src: `${ENDPOINT}/a.jpg`, width: 640, quality: 80 })).toBe(
      `${ENDPOINT}/tr:w-640,c-maintain_ratio,q-80,f-auto/a.jpg`,
    );
  });

  it('defaults quality when next does not pass one', async () => {
    const { default: loader } = await load(true);
    expect(loader({ src: `${ENDPOINT}/a.jpg`, width: 100 })).toContain('q-75');
  });
});

describe('with ImageKit not configured', () => {
  it('hands a local path back to Next own optimiser', async () => {
    const { default: loader } = await load(false);
    expect(loader({ src: '/api/media/upload/a.jpg', width: 640, quality: 75 })).toBe(
      '/_next/image?url=%2Fapi%2Fmedia%2Fupload%2Fa.jpg&w=640&q=75',
    );
  });

  it('optimises a remote host that is configured in next.config', async () => {
    const { default: loader } = await load(false);
    const url = loader({ src: 'https://images.unsplash.com/photo-1', width: 640 });
    expect(url.startsWith('/_next/image?')).toBe(true);
  });

  /*
   * The optimiser returns 400 for a host that is not in `remotePatterns`, so
   * routing an unlisted host through it would turn a working image into a
   * broken one. Passing it through unoptimised is the lesser failure.
   */
  it('passes an unlisted remote host through untouched', async () => {
    const { default: loader } = await load(false);
    expect(loader({ src: 'https://elsewhere.example/a.jpg', width: 640 })).toBe(
      'https://elsewhere.example/a.jpg',
    );
  });
});

/*
 * A loader cannot read the Next config at runtime, so its host list is a copy.
 * This is the check that stops the copy drifting from the original — the
 * failure mode being images that silently stop optimising.
 */
describe('the remote host list', () => {
  it('matches remotePatterns in next.config.ts', async () => {
    const { OPTIMISABLE_REMOTE_HOSTS } = await load(false);
    const config = readFileSync('next.config.ts', 'utf8');

    const hosts = [...config.matchAll(/hostname:\s*'([^']+)'/g)].map((match) => match[1]);
    const withoutImageKit = hosts.filter((host) => host !== 'ik.imagekit.io');

    expect([...OPTIMISABLE_REMOTE_HOSTS].sort()).toEqual(withoutImageKit.sort());
  });
});
