import type { Metadata, Viewport } from 'next';
import { Fraunces, Inter } from 'next/font/google';
import { Toaster } from 'sonner';

import { siteConfig, siteUrl } from '@/config/site';
import { cn } from '@/lib/cn';

import '@/styles/global.css';

/**
 * Root layout.
 *
 * Deliberately thin. Each application (storefront, seller console, admin
 * console) brings its own chrome from its route group, so nothing here assumes
 * a header or a container — the seller console is a sidebar shell and would
 * have to undo any storefront layout applied at the root.
 */

/**
 * Fonts are self-hosted by `next/font`, which matters for two reasons: it
 * removes a render-blocking round trip to a third party (LCP), and it emits a
 * `size-adjust` fallback so swapping from the system font to the real one does
 * not reflow the page (CLS).
 */
const sans = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
  // The token sheet calls for these; loading the variable axes keeps one file.
  weight: ['400', '500', '600', '700'],
});

const display = Fraunces({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-fraunces',
  weight: ['400', '600'],
  style: ['normal'],
});

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl()),
  title: {
    default: `${siteConfig.name} — ${siteConfig.tagline}`,
    // Every page supplies its own name; the brand is appended once, here.
    template: `%s | ${siteConfig.name}`,
  },
  description: siteConfig.description,
  applicationName: siteConfig.name,
  referrer: 'strict-origin-when-cross-origin',
  formatDetection: { telephone: false, address: false, email: false },
  openGraph: {
    type: 'website',
    siteName: siteConfig.name,
    locale: siteConfig.locale,
    url: siteUrl(),
  },
  twitter: { card: 'summary_large_image', site: '@vestra' },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  // Pinch-zoom must stay available; capping it at 1 is an accessibility failure.
  maximumScale: 5,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#faf8f5' },
    { media: '(prefers-color-scheme: dark)', color: '#111013' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang={siteConfig.language} suppressHydrationWarning>
      <body className={cn(sans.variable, display.variable, 'min-h-dvh antialiased')}>
        {children}

        <Toaster
          position="bottom-center"
          // Toasts inherit the design tokens rather than sonner's defaults, so
          // a success toast matches a success badge.
          toastOptions={{
            classNames: {
              toast:
                'bg-raised text-ink border border-line shadow-lg rounded-md text-sm',
              description: 'text-muted',
              actionButton: 'bg-accent text-on-inverse rounded-sm',
              cancelButton: 'bg-sunken text-muted rounded-sm',
            },
          }}
          closeButton
          richColors={false}
        />
      </body>
    </html>
  );
}
