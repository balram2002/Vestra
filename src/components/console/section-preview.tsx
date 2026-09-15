'use client';

import { ExternalLink, Monitor, RefreshCw, Smartphone } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import type { HomeSection } from '@/domain/types';
import { cn } from '@/lib/cn';

/**
 * The section, as a shopper will see it.
 *
 * A FRAME ONTO THE REAL STOREFRONT, not a mock-up. It loads `/preview/section`,
 * which renders through the same components the homepage uses against the live
 * catalogue -- so the eight products an editor picked appear with their real
 * photographs, prices and stock, and a layout change shows the actual grid.
 * A hand-drawn preview inside the console would agree with the shop until the
 * day somebody changed one and not the other.
 *
 * SHRUNK, NOT SQUASHED. The frame renders at a real desktop or phone width and
 * is scaled down to fit the column, so a rail that shows four cards at 1280px
 * shows four cards here too. Rendering it at the column's own width would
 * preview the tablet layout and call it the desktop one.
 *
 * The draft travels in the URL and is rendered, never saved. Changes are sent
 * after a short pause rather than on every keystroke, and the last good frame
 * stays up under a loading veil while the next one arrives.
 */

const FRAMES = {
  desktop: { width: 1280, height: 860, label: 'Desktop' },
  phone: { width: 390, height: 780, label: 'Phone' },
} as const;

type Device = keyof typeof FRAMES;

interface PreviewFields {
  title: string | null;
  subtitle: string | null;
  href: string | null;
  ctaLabel: string | null;
  startsAt: string | null;
  endsAt: string | null;
  config: HomeSection['config'];
}

export function previewFields(section: HomeSection): PreviewFields {
  const { title, subtitle, href, ctaLabel, startsAt, endsAt, config } = section;
  return { title, subtitle, href, ctaLabel, startsAt, endsAt, config };
}

/** URL-safe base64 of UTF-8 JSON. `btoa` alone breaks on the rupee sign. */
function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function srcFor(sectionId: string, fields: PreviewFields | null, nonce: number): string {
  const params = new URLSearchParams({ id: sectionId });
  if (fields) params.set('draft', toBase64Url(JSON.stringify(fields)));
  // A cache-buster for Refresh: the same draft, fetched again on purpose.
  if (nonce > 0) params.set('v', String(nonce));
  return `/preview/section?${params.toString()}`;
}

export function SectionPreview({
  section,
  draft,
  dirty,
}: {
  section: HomeSection;
  draft: HomeSection;
  dirty: boolean;
}) {
  const [device, setDevice] = useState<Device>('desktop');
  const [nonce, setNonce] = useState(0);
  const [initial] = useState(() => srcFor(section.id, null, 0));
  const [src, setSrc] = useState(initial);
  const current = useRef(initial);
  const [loading, setLoading] = useState(true);
  const [width, setWidth] = useState(0);
  const box = useRef<HTMLDivElement>(null);

  const draftKey = JSON.stringify(previewFields(draft));

  /*
   * Follow the draft, after a pause.
   *
   * Everything is written from the timer's callback rather than in the effect
   * body, and only when the address actually changes -- setting "loading" for a
   * frame that is not going to reload would leave the veil up forever, because
   * `onLoad` never fires for an iframe whose src did not change.
   */
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const next = srcFor(section.id, dirty ? (JSON.parse(draftKey) as PreviewFields) : null, nonce);
      if (next === current.current) return;
      current.current = next;
      setLoading(true);
      setSrc(next);
    }, 450);

    return () => window.clearTimeout(timer);
  }, [section.id, dirty, draftKey, nonce]);

  // The column's width decides the scale; the frame keeps its true width.
  useEffect(() => {
    const node = box.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const frame = FRAMES[device];
  const scale = width > 0 ? Math.min(1, width / frame.width) : 0;
  const offset = width > 0 ? Math.max(0, (width - frame.width * scale) / 2) : 0;

  return (
    <div className="border-line bg-raised overflow-hidden rounded-lg border">
      <div className="border-line flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
        <div className="min-w-0">
          <p className="text-ink text-xs font-semibold">Live preview</p>
          <p className="text-faint truncate text-2xs">
            {dirty ? 'Showing your unsaved changes, with real shop data' : 'Showing what shoppers see now'}
          </p>
        </div>

        <div className="flex items-center gap-1">
          <div className="bg-sunken flex rounded-md p-0.5" role="group" aria-label="Preview size">
            {(Object.keys(FRAMES) as Device[]).map((option) => {
              const Icon = option === 'desktop' ? Monitor : Smartphone;
              return (
                <button
                  key={option}
                  type="button"
                  aria-pressed={device === option}
                  onClick={() => {
                    if (option === device) return;
                    setLoading(true);
                    setDevice(option);
                  }}
                  className={cn(
                    'flex h-7 items-center gap-1.5 rounded px-2 text-2xs font-medium transition-colors',
                    device === option ? 'bg-raised text-ink shadow-sm' : 'text-muted hover:text-ink',
                  )}
                >
                  <Icon className="size-3.5" aria-hidden />
                  {FRAMES[option].label}
                </button>
              );
            })}
          </div>

          <button
            type="button"
            onClick={() => setNonce((value) => value + 1)}
            aria-label="Refresh the preview"
            title="Refresh the preview"
            className="text-muted hover:bg-sunken hover:text-ink grid size-7 place-items-center rounded-md"
          >
            <RefreshCw className={cn('size-3.5', loading && 'animate-spin')} aria-hidden />
          </button>

          <a
            href={src}
            target="_blank"
            rel="noreferrer"
            aria-label="Open the preview in a new tab"
            title="Open in a new tab"
            className="text-muted hover:bg-sunken hover:text-ink grid size-7 place-items-center rounded-md"
          >
            <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </div>
      </div>

      <div
        ref={box}
        className="bg-sunken relative w-full overflow-hidden"
        style={{ height: scale > 0 ? Math.round(frame.height * scale) : 420 }}
      >
        {scale > 0 ? (
          <iframe
            // A new device is a new frame, so the old width never flashes.
            key={device}
            src={src}
            title="Section preview"
            onLoad={() => setLoading(false)}
            className="bg-canvas absolute top-0 origin-top-left border-0"
            style={{
              left: offset,
              width: frame.width,
              height: frame.height,
              transform: `scale(${scale})`,
            }}
          />
        ) : null}

        {loading ? (
          <div
            className="bg-canvas/70 absolute inset-0 grid place-items-center backdrop-blur-[1px]"
            aria-live="polite"
          >
            <div className="w-2/3 max-w-sm space-y-2" aria-hidden>
              <div className="skeleton h-5 w-1/2 rounded" />
              <div className="grid grid-cols-4 gap-2">
                {[0, 1, 2, 3].map((tile) => (
                  <div key={tile} className="skeleton aspect-3/4 rounded-md" />
                ))}
              </div>
            </div>
            <span className="sr-only">Updating the preview</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
