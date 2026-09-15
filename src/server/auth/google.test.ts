import { beforeEach, describe, expect, it, vi } from 'vitest';
import { jwtVerify } from 'jose';

const mocks = vi.hoisted(() => ({ values: new Map<string, string>(), findOne: vi.fn() }));
vi.mock('next/headers', () => ({ cookies: async () => ({
  get: (key: string) => mocks.values.has(key) ? { value: mocks.values.get(key) } : undefined,
  set: (key: string, value: string) => mocks.values.set(key, value),
}) }));
vi.mock('../db/collections', () => ({ collections: { users: async () => ({ findOne: mocks.findOne }) }, toEntity: (value: unknown) => value }));
vi.mock('./complete-sign-in', () => ({ completeSignIn: vi.fn() }));
vi.mock('./two-factor', () => ({ startSignInChallenge: vi.fn() }));
import { beginGoogleSignIn, finishGoogleSignIn } from './google';

describe('Google authorization flow boundary', () => {
  beforeEach(() => {
    mocks.values.clear(); vi.clearAllMocks();
    vi.stubEnv('AUTH_SECRET', 'test-only-secret-that-is-at-least-32-characters');
    vi.stubEnv('GOOGLE_CLIENT_ID', 'test.apps.googleusercontent.com');
    vi.stubEnv('GOOGLE_CLIENT_SECRET', 'test-client-secret');
    vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'http://localhost:3000');
  });
  it('binds state, nonce and PKCE to a short-lived signed cookie and strips external destinations', async () => {
    const url = new URL(await beginGoogleSignIn('https://untrusted.example'));
    expect(url.origin).toBe('https://accounts.google.com');
    expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    expect(url.searchParams.get('scope')).toBe('openid email profile');
    const { payload } = await jwtVerify(mocks.values.get('vestra_google_flow')!, new TextEncoder().encode(process.env.AUTH_SECRET), { audience: 'google-flow' });
    expect(payload.state).toBe(url.searchParams.get('state'));
    expect(payload.nonce).toBe(url.searchParams.get('nonce'));
    expect(payload.next).toBeNull();
    expect(payload.exp! - payload.iat!).toBe(600);
  });
  it('refuses callbacks without a flow cookie before any account lookup', async () => {
    expect(await finishGoogleSignIn(new URL('http://localhost:3000/api/auth/google/callback?code=fake'))).toContain('google-failed');
    expect(mocks.findOne).not.toHaveBeenCalled();
  });
  it('rejects mismatched state and clears the flow cookie', async () => {
    await beginGoogleSignIn('/bag');
    expect(await finishGoogleSignIn(new URL('http://localhost:3000/api/auth/google/callback?state=wrong&code=fake'))).toContain('google-failed');
    expect(mocks.values.get('vestra_google_flow')).toBe('');
    expect(mocks.findOne).not.toHaveBeenCalled();
  });
  it('handles cancellation only after checking state', async () => {
    const url = new URL(await beginGoogleSignIn('/bag'));
    expect(await finishGoogleSignIn(new URL(`http://localhost:3000/api/auth/google/callback?state=${url.searchParams.get('state')}&error=access_denied`))).toContain('google-cancelled');
  });
  it('offers password sign-in when credentials are absent', async () => {
    vi.stubEnv('GOOGLE_CLIENT_SECRET', '');
    expect(await beginGoogleSignIn(null)).toBe('/login?error=google-unavailable');
  });
});
