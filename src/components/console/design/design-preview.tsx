'use client';

import { ExternalLink, Monitor, RefreshCw, Smartphone, Tablet } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

import { Select } from '@/components/ui/select';
import { cn } from '@/lib/cn';

const DEVICES = [
  { key: 'phone', label: 'Phone', width: 390, icon: Smartphone },
  { key: 'tablet', label: 'Tablet', width: 768, icon: Tablet },
  { key: 'desktop', label: 'Desktop', width: 1280, icon: Monitor },
] as const;

type Device = (typeof DEVICES)[number]['key'];

/**
 * The page itself, beside the settings.
 *
 * A real storefront page in a frame, rendered at the chosen device's true
 * width and scaled down to fit -- so a phone preview is a phone LAYOUT, not a
 * desktop page squeezed narrow. It shows the saved draft, and reloads each time
 * the draft is saved.
 */
export function DesignPreview({
  path,
  reloadKey,
  entities,
  entity,
  onEntity,
  entityLabel,
}: {
  /** The preview path, or null when there is nothing to show it with. */
  path: string | null;
  reloadKey: number;
  entities: Array<{ value: string; label: string }>;
  entity: string;
  onEntity: (value: string) => void;
  entityLabel: string;
}) {
  const [device, setDevice] = useState<Device>('phone');
  const [manual, setManual] = useState(0);
  const [loadedKey, setLoadedKey] = useState('');
  const frame = useRef<HTMLDivElement>(null);
  const [available, setAvailable] = useState(360);

  useEffect(() => {
    const element = frame.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => setAvailable(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const width = DEVICES.find((item) => item.key === device)!.width;
  const scale = Math.min(1, available / width);
  const height = 760;
  const src = path ? `${path}${path.includes('?') ? '&' : '?'}embed=1` : null;
  const frameKey = `${src}-${reloadKey}-${manual}`;
  const loading = Boolean(src) && loadedKey !== frameKey;

  return (
    <section className="border-line bg-raised rounded-lg border" aria-label="Preview">
      <header className="border-line flex flex-wrap items-center gap-2 border-b px-3 py-2">
        <div role="radiogroup" aria-label="Device" className="bg-sunken flex rounded-md p-0.5">
          {DEVICES.map((item) => (
            <button
              key={item.key}
              type="button"
              role="radio"
              aria-checked={device === item.key}
              aria-label={item.label}
              title={`${item.label} · ${item.width}px`}
              onClick={() => setDevice(item.key)}
              className={cn(
                'grid size-8 place-items-center rounded',
                device === item.key ? 'bg-raised text-ink shadow-sm' : 'text-muted hover:text-ink',
              )}
            >
              <item.icon className="size-4" aria-hidden />
            </button>
          ))}
        </div>

        {entities.length > 0 ? (
          <div className="min-w-40 flex-1">
            <Select label={entityLabel} hideLabel value={entity} onChange={(event) => onEntity(event.target.value)}>
              {entities.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </Select>
          </div>
        ) : (
          <span className="flex-1" />
        )}

        <button
          type="button"
          onClick={() => setManual((value) => value + 1)}
          className="text-muted hover:text-ink hover:bg-sunken grid size-8 place-items-center rounded"
          aria-label="Reload preview"
          title="Reload preview"
        >
          <RefreshCw className={cn('size-4', loading && 'animate-spin')} aria-hidden />
        </button>
        {src ? (
          <a
            href={path!}
            target="_blank"
            rel="noreferrer"
            className="text-muted hover:text-ink hover:bg-sunken grid size-8 place-items-center rounded"
            aria-label="Open the preview in a new tab"
            title="Open in a new tab"
          >
            <ExternalLink className="size-4" aria-hidden />
          </a>
        ) : null}
      </header>

      <div ref={frame} className="bg-sunken overflow-hidden p-0" style={{ height: height * scale }}>
        {src ? (
          <iframe
            key={frameKey}
            src={src}
            title="Page preview"
            onLoad={() => setLoadedKey(frameKey)}
            className="bg-canvas origin-top-left border-0"
            style={{ width, height, transform: `scale(${scale})`, marginLeft: Math.max(0, (available - width * scale) / 2) }}
          />
        ) : (
          <p className="text-muted grid h-full place-items-center p-6 text-center text-sm">
            There is nothing to preview this page with yet.
          </p>
        )}
      </div>
      <p className="text-faint border-line border-t px-3 py-2 text-2xs">
        Shows the saved draft at {width}px. Shoppers see nothing until you publish.
      </p>
    </section>
  );
}
