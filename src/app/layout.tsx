import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono, Inter, Plus_Jakarta_Sans } from 'next/font/google';
import { Toaster } from 'sonner';

import { siteConfig, siteUrl } from '@/config/site';
import { cn } from '@/lib/cn';
import { themeInitScript } from '@/lib/theme';

import '@/styles/global.css';

/**
 * Root layout.
 *
 * Deliberately thin. Each application (storefront, seller console, admin
 * console) brings its own chrome from its route group, so nothing here assumes
 * a header or a container — the seller console is a sidebar shell and would
 * have to undo any storefront layout applied at the root.
 *
 * The three faces are the whole of Meridian's typographic system, and they are
 * loaded here so `next/font` can self-host them. That matters twice over: it
 * removes a render-blocking round trip to a third party (LCP), and it emits a
 * `size-adjust` fallback so swapping from the system font to the real one does
 * not reflow the page (CLS).
 */

/**
 * The UI face.
 *
 * Inter. The most rigorously hinted interface typeface in existence, and the
 * reason a 13px console table stays readable at 125% Windows scaling on a
 * low-DPI monitor — which is what a seller's fulfilment desk actually is.
 *
 * Loaded as a VARIABLE font: one file covers 100 through 900, which is smaller
 * than the four static cuts it replaces and lets the type scale ask for 550
 * where 500 is thin and 600 is heavy.
 */
const sans = Inter({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-inter',
});

/**
 * The display face.
 *
 * Plus Jakarta Sans, set at 700-800 with hard negative tracking — see
 * `.headline` in `global.css`. A geometric humanist rather than a serif,
 * because a serif display face on a marketplace reads as heritage and this is
 * not a heritage brand. Its high x-height and genuinely round bowls hold their
 * shape at 92px over a photograph, which is where most of these headlines
 * actually live.
 *
 * The CONSOLES never use it. `.console-type` in `global.css` puts every heading
 * inside a console shell back on the UI face, because the fashion voice in a
 * fulfilment queue is decoration in a place that wants clarity.
 */
const display = Plus_Jakarta_Sans({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-jakarta',
  weight: ['500', '600', '700', '800'],
});

/**
 * For identifiers, and only for identifiers.
 *
 * An AWB, a GSTIN, an invoice number and an order number are compared character
 * by character by a human being — usually against something printed, and often
 * over the phone. IBM Plex Mono's slashed zero and flagged one are the entire
 * reason it is in the bundle. Two weights, no italics.
 */
const mono = IBM_Plex_Mono({
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-plex-mono',
  weight: ['400', '500'],
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
  twitter: { card: 'summary_large_image', site: '@vestrawab' },
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
  /*
   * The browser chrome's own colour, per theme. These are `--surface-canvas` in
   * each theme and have to be kept in step with `tokens.css` by hand — a
   * `<meta>` cannot read a custom property.
   */
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f6f7fa' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0d14' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang={siteConfig.language} suppressHydrationWarning>
      <head>
        {/*
          Runs before the first paint and stamps `data-theme` on <html>.
          Anything deferred to hydration paints the wrong theme first, and that
          white flash is what makes a dark mode feel broken on every load.
        */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body className={cn(sans.variable, display.variable, mono.variable, 'min-h-dvh antialiased')}>
        {children}

        {/*
          Toasts inherit the design tokens rather than sonner's defaults, so a
          success toast matches a success badge and a destructive one matches a
          danger button.

          Bottom-centre and not top-right: on a phone the top-right corner is
          the least reachable part of the screen, and a toast carrying an action
          that cannot be tapped is a toast that does not exist.
        */}
        <Toaster
          position="bottom-center"
          offset={16}
          gap={10}
          toastOptions={{
            classNames: {
              toast:
                'bg-raised text-ink border border-line shadow-lg rounded-xl text-sm gap-2.5 px-4 py-3',
              title: 'font-medium tracking-[-0.006em]',
              description: 'text-muted text-xs',
              actionButton: 'bg-accent text-on-accent rounded-md font-medium',
              cancelButton: 'bg-sunken text-muted rounded-md',
              closeButton: 'bg-raised border-line text-muted hover:text-ink',
            },
          }}
          closeButton
          richColors={false}
        />
      </body>
    </html>
  );
}
