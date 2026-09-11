import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The `next/image` loader.
 *
 * Registered as `loaderFile`, so a mistake here breaks every image in the app
 * at once. The rule these tests hold it to: every source goes somewhere that
 * can serve it, and nothing is ever sent to `/_next/image`, which a host does
 * not provision once a custom loader is set.
 */

const ENDPOINT = 'https://ik.imagekit.io/vestra';
const PHOTO =
  'https://images.unsplash.com/photo-1?auto=format&fit=crop&crop=entropy&w=800&h=1000&q=80';

async function load(configured: boolean, proxy = false) {
  vi.resetModules();
  if (configured) {
    process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT = ENDPOINT;
    process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY = 'public_test';
  } else {
    delete process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT;
    delete process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY;
  }
  if (proxy) process.env.NEXT_PUBLIC_IMAGEKIT_WEB_PROXY = 'true';
  else delete process.env.NEXT_PUBLIC_IMAGEKIT_WEB_PROXY;
  return import('./image-loader');
}

const original = {
  endpoint: process.env.NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT,
  key: process.env.NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY,
  proxy: process.env.NEXT_PUBLIC_IMAGEKIT_WEB_PROXY,
};

afterEach(() => {
  for (const [name, value] of [
    ['NEXT_PUBLIC_IMAGEKIT_URL_ENDPOINT', original.endpoint],
    ['NEXT_PUBLIC_IMAGEKIT_PUBLIC_KEY', original.key],
    ['NEXT_PUBLIC_IMAGEKIT_WEB_PROXY', original.proxy],
  ] as const) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

describe('with ImageKit configured', () => {
  it('serves an ImageKit upload from ImageKit at the requested width', async () => {
    const { default: loader } = await load(true);
    expect(loader({ src: `${ENDPOINT}/a.jpg`, width: 640, quality: 80 })).toBe(
      `${ENDPOINT}/tr:w-640,c-maintain_ratio,q-80,f-auto/a.jpg`,
    );
  });

  it('defaults quality when next does not pass one', async () => {
    const { default: loader } = await load(true);
    expect(loader({ src: `${ENDPOINT}/a.jpg`, width: 100 })).toContain('q-75');
  });

  /*
   * The regression this file exists for: with the web proxy off, ImageKit
   * answers 404 for a remote source, and every category tile rendered empty.
   */
  it('does not send remote photography to ImageKit unless the web proxy is on', async () => {
    const { default: loader } = await load(true);
    const url = loader({ src: PHOTO, width: 640 });
    expect(url.startsWith('https://images.unsplash.com/')).toBe(true);
    expect(url).not.toContain('ik.imagekit.io');
  });

  it('uses the web proxy for a remote source when it is switched on', async () => {
    const { default: loader } = await load(true, true);
    expect(loader({ src: 'https://elsewhere.example/a.jpg', width: 640 })).toBe(
      `${ENDPOINT}/tr:w-640,c-maintain_ratio,q-75,f-auto/https://elsewhere.example/a.jpg`,
    );
  });

  it('serves a path this app owns as it is', async () => {
    const { default: loader } = await load(true);
    expect(loader({ src: '/api/media/upload/a.jpg', width: 640 })).toBe('/api/media/upload/a.jpg');
  });
});

describe('with ImageKit not configured', () => {
  it('resizes Unsplash photography on Unsplash, keeping its crop', async () => {
    const { default: loader } = await load(false);
    const url = new URL(loader({ src: PHOTO, width: 400, quality: 60 }));
    expect(url.hostname).toBe('images.unsplash.com');
    expect(url.searchParams.get('w')).toBe('400');
    expect(url.searchParams.get('h')).toBe('500');
    expect(url.searchParams.get('q')).toBe('60');
    expect(url.searchParams.get('fit')).toBe('crop');
  });

  it('serves a local path and an unknown host as they are', async () => {
    const { default: loader } = await load(false);
    expect(loader({ src: '/api/media/t/brand/a.svg', width: 640 })).toBe('/api/media/t/brand/a.svg');
    expect(loader({ src: 'https://elsewhere.example/a.jpg', width: 640 })).toBe(
      'https://elsewhere.example/a.jpg',
    );
  });

  it('never hands anything to /_next/image', async () => {
    const { default: loader } = await load(false);
    for (const src of [PHOTO, '/api/media/upload/a.jpg', 'https://elsewhere.example/a.jpg']) {
      expect(loader({ src, width: 640 })).not.toContain('/_next/image');
    }
  });
});
