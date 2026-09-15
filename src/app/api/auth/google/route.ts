import { type NextRequest, NextResponse } from 'next/server';
import { beginGoogleSignIn } from '@/server/auth/google';

export async function GET(request: NextRequest) {
  const destination = await beginGoogleSignIn(request.nextUrl.searchParams.get('next'));
  return NextResponse.redirect(new URL(destination, request.url));
}
