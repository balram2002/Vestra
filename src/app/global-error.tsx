'use client';

import { useEffect } from 'react';

/**
 * The last-resort boundary, for an error in the root layout itself.
 *
 * It replaces the whole document, so it cannot lean on the layout's fonts, CSS
 * or theme: everything here is inline and system-default, and it still has to
 * look deliberate rather than broken. The digest is the reference support
 * uses to find the server-side trace.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[vestrawab] root layout failed', error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          padding: '24px',
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          background: '#f7f8fb',
          color: '#161a26',
        }}
      >
        <main style={{ maxWidth: 420, textAlign: 'center' }}>
          <h1 style={{ fontSize: 22, fontWeight: 600, margin: 0 }}>We could not load VestraWAB</h1>
          <p style={{ color: '#5b6275', fontSize: 15, lineHeight: 1.55, marginTop: 10 }}>
            Something failed at our end. Try again in a moment. If it keeps happening, quote the
            reference below to support.
          </p>
          {error.digest ? (
            <p style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13, color: '#5b6275' }}>
              Reference {error.digest}
            </p>
          ) : null}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginTop: 20 }}>
            <button
              type="button"
              onClick={reset}
              style={{
                border: 0,
                borderRadius: 999,
                padding: '10px 20px',
                background: '#4f46e5',
                color: '#fff',
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Try again
            </button>
            {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
            <a
              href="/"
              style={{
                borderRadius: 999,
                padding: '10px 20px',
                border: '1px solid #d6d9e3',
                color: '#161a26',
                fontSize: 15,
                textDecoration: 'none',
              }}
            >
              Home
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}