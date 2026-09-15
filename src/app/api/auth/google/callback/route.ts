import { type NextRequest, NextResponse } from 'next/server';
import { finishGoogleSignIn } from '@/server/auth/google';
import { connection } from 'next/server';

export async function GET(request: NextRequest) {
  await connection();
  let destination = '/login?error=google-failed';
  try { destination = await finishGoogleSignIn(request.nextUrl); }
  catch { console.error('[auth:google] Sign-in could not be completed'); }
  return NextResponse.redirect(new URL(destination, request.url));
}
