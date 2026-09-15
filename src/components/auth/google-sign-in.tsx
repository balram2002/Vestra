import { googleEnabled } from '@/server/auth/google';

export function GoogleSignIn({ next }: { next?: string }) {
  if (!googleEnabled()) return null;
  return <div className="mb-6">
    {/* A full navigation starts the provider redirect and its HttpOnly flow cookie. */}
    <a href={`/api/auth/google${next ? `?next=${encodeURIComponent(next)}` : ''}`}
      className="border-line bg-raised text-ink flex min-h-12 items-center justify-center gap-3 rounded-xl border text-sm font-medium hover:bg-sunken">
      <span aria-hidden className="text-lg font-bold">G</span> Continue with Google
    </a>
    <div className="text-faint mt-5 flex items-center gap-3 text-xs"><span className="bg-line h-px flex-1" />or use your email<span className="bg-line h-px flex-1" /></div>
  </div>;
}
