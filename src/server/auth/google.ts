import 'server-only';

import { createHash, randomBytes } from 'node:crypto';
import { createRemoteJWKSet, jwtVerify, SignJWT } from 'jose';
import { cookies } from 'next/headers';

import { siteUrl } from '@/config/site';
import { defaultNotificationPreferences } from '@/domain/notifications';
import type { User } from '@/domain/types';
import { entityId } from '@/lib/ids';
import { safeNext } from '@/lib/safe-next';
import { collections, toEntity } from '../db/collections';
import { completeSignIn } from './complete-sign-in';
import { startSignInChallenge } from './two-factor';

const COOKIE = 'vestra_google_flow';
const keys = createRemoteJWKSet(new URL('https://www.googleapis.com/oauth2/v3/certs'));
export const googleEnabled = () => Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
const callbackUrl = () => new URL('/api/auth/google/callback', siteUrl()).href;
function secret() {
  if (!process.env.AUTH_SECRET) throw new Error('Authentication is not configured');
  return new TextEncoder().encode(process.env.AUTH_SECRET);
}

export async function beginGoogleSignIn(next: string | null): Promise<string> {
  if (!googleEnabled()) return '/login?error=google-unavailable';
  const state = randomBytes(32).toString('base64url');
  const nonce = randomBytes(32).toString('base64url');
  const verifier = randomBytes(32).toString('base64url');
  const token = await new SignJWT({ state, nonce, verifier, next: safeNext(next) })
    .setProtectedHeader({ alg: 'HS256' }).setAudience('google-flow').setIssuedAt()
    .setExpirationTime('10m').sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax',
    path: '/api/auth/google', maxAge: 600,
  });
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  url.search = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!, redirect_uri: callbackUrl(),
    response_type: 'code', scope: 'openid email profile', state, nonce,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    code_challenge_method: 'S256', prompt: 'select_account',
  }).toString();
  return url.href;
}

export async function finishGoogleSignIn(url: URL): Promise<string> {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  jar.set(COOKIE, '', { path: '/api/auth/google', maxAge: 0 });
  if (!googleEnabled() || !token) return '/login?error=google-failed';
  const { payload: flow } = await jwtVerify(token, secret(), { audience: 'google-flow', algorithms: ['HS256'] });
  if (!flow.state || flow.state !== url.searchParams.get('state')) return '/login?error=google-failed';
  if (url.searchParams.has('error')) return '/login?error=google-cancelled';
  const code = url.searchParams.get('code');
  if (!code || typeof flow.verifier !== 'string') return '/login?error=google-failed';
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', cache: 'no-store', signal: AbortSignal.timeout(15000),
    body: new URLSearchParams({ code, client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!, redirect_uri: callbackUrl(),
      grant_type: 'authorization_code', code_verifier: flow.verifier }),
  });
  if (!response.ok) return '/login?error=google-failed';
  const tokens = await response.json() as { id_token?: string };
  if (!tokens.id_token) return '/login?error=google-failed';
  const { payload } = await jwtVerify(tokens.id_token, keys, {
    issuer: ['https://accounts.google.com', 'accounts.google.com'],
    audience: process.env.GOOGLE_CLIENT_ID!, algorithms: ['RS256'],
  });
  if (payload.nonce !== flow.nonce || !payload.sub || payload.email_verified !== true || typeof payload.email !== 'string') {
    return '/login?error=google-failed';
  }
  const users = await collections.users();
  // The subject is the stable provider identity. Never silently link an existing
  // password account by matching an email supplied by an identity provider.
  let user: User | null = toEntity(await users.findOne({ googleSubject: payload.sub }));
  if (!user) {
    const email = payload.email.toLowerCase();
    if (await users.findOne({ email })) return '/login?error=google-existing';
    const now = new Date().toISOString();
    user = {
      id: entityId('usr'), googleSubject: payload.sub, email, emailVerified: true,
      fullName: typeof payload.name === 'string' ? payload.name.slice(0, 80) : email.split('@')[0]!,
      passwordHash: 'oauth-only', phone: null, phoneVerified: false,
      roles: ['CUSTOMER'], status: 'ACTIVE', avatarUrl: null, gender: null, dateOfBirth: null,
      sellerId: null, createdAt: now, updatedAt: now, lastLoginAt: null, creditBalance: 0,
      preferences: { notifications: defaultNotificationPreferences(), marketingOptIn: false,
        theme: 'system', preferredSizes: {}, language: 'en-IN', currency: 'INR' },
    } satisfies User;
    try { await users.insertOne({ ...user, _id: user.id }); }
    catch (error) {
      if ((error as { code?: number }).code !== 11000) throw error;
      user = toEntity(await users.findOne({ googleSubject: payload.sub }));
      if (!user) return '/login?error=google-existing';
    }
  }
  if (user.status !== 'ACTIVE') return '/login?error=google-inactive';
  const next = typeof flow.next === 'string' ? flow.next : null;
  if (user.twoFactor?.enabled) {
    const challenge = await startSignInChallenge(user, next);
    return challenge.ok ? '/login/verify' : '/login?error=google-failed';
  }
  return completeSignIn(user, next);
}
