'use client';

import { AlertCircle, Check, RotateCcw, UploadCloud, X } from 'lucide-react';
import { useId, useRef, useState } from 'react';

import { useUploader, type UploadItem, type UploadedFile } from '@/hooks/use-uploader';
import { formatDuration, formatFileSize, formatTransferRate } from '@/lib/format';
import { cn } from '@/lib/cn';

/**
 * File upload.
 *
 * One component for every upload in the app, because a seller who has learned
 * how photographs work should not have to learn again for their GST
 * certificate.
 *
 * What it shows while a file is in flight is the point: a percentage, the bytes
 * so far against the total, the current rate, and how long is left. Those four
 * together are what tells someone on a slow connection that the thing is
 * working — a spinner tells them nothing, and an indeterminate bar tells them
 * nothing twice.
 *
 * Accessibility is not an afterthought here. The drop zone is a real button, so
 * it is reachable and operable from the keyboard; progress is a real
 * `progressbar` with its values set; and because a moving number announced on
 * every frame would make a screen reader unusable, the live region carries only
 * the transitions that matter — started, failed, finished.
 */

export interface FileUploadProps {
  purpose: 'listing' | 'kyc';
  /** Called as each file lands. Persisting it is the caller's business. */
  onUploaded: (file: UploadedFile) => void | Promise<void>;
  accept?: string;
  multiple?: boolean;
  /** Refused before anything is sent, with the reason. */
  maxBytes?: number;
  /** How many more files the caller can accept right now. */
  remaining?: number;
  label?: string;
  hint?: string;
  disabled?: boolean;
  className?: string;
  /**
   * A stable id for the underlying input.
   *
   * The input is visually hidden — the drop zone is the control people see —
   * but automation and any external `<label for>` still need to address it.
   */
  inputId?: string;
}

export function FileUpload({
  purpose,
  onUploaded,
  accept = 'image/jpeg,image/png,image/webp,image/avif',
  multiple = true,
  maxBytes,
  remaining,
  label = 'Drag photos here, or browse',
  hint,
  disabled = false,
  className,
  inputId,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [rejected, setRejected] = useState<string[]>([]);
  const describedBy = useId();

  const { items, add, cancel, retry, remove, busy, overallPercent } = useUploader({
    purpose,
    onUploaded,
  });

  /**
   * Refuse locally what the server would refuse anyway.
   *
   * A courtesy, not a control: it saves someone a two-minute upload that was
   * always going to be rejected. The server re-checks everything, and it checks
   * the bytes rather than the name.
   */
  const accepted = (chosen: File[]): File[] => {
    const problems: string[] = [];
    const room = remaining ?? Number.POSITIVE_INFINITY;
    const keep: File[] = [];

    for (const file of chosen) {
      if (keep.length >= room) {
        problems.push(`${file.name} — no room for more right now.`);
        continue;
      }
      if (maxBytes && file.size > maxBytes) {
        problems.push(
          `${file.name} is ${formatFileSize(file.size)}; the limit is ${formatFileSize(maxBytes)}.`,
        );
        continue;
      }
      if (file.size === 0) {
        problems.push(`${file.name} is empty.`);
        continue;
      }
      keep.push(file);
    }

    setRejected(problems);
    return keep;
  };

  const choose = (list: FileList | null) => {
    if (!list || disabled) return;
    const usable = accepted(Array.from(list));
    if (usable.length > 0) void add(usable);
    if (inputRef.current) inputRef.current.value = '';
  };

  const full = remaining !== undefined && remaining <= 0;

  return (
    <div className={cn('space-y-3', className)}>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={disabled || full}
        aria-describedby={hint ? describedBy : undefined}
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled && !full) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          choose(event.dataTransfer.files);
        }}
        className={cn(
          'flex w-full flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-6 py-8 text-center transition-colors',
          'focus-visible:outline-accent focus-visible:outline-2 focus-visible:outline-offset-2',
          dragging && 'border-accent bg-accent-soft',
          !dragging && !disabled && !full && 'border-line-strong hover:border-ink',
          (disabled || full) && 'border-line cursor-not-allowed opacity-60',
        )}
      >
        <UploadCloud className={cn('size-6', dragging ? 'text-accent' : 'text-faint')} aria-hidden />
        <span className="text-ink text-sm font-medium">
          {full ? 'No room for more right now' : label}
        </span>
        {hint ? (
          <span id={describedBy} className="text-faint text-2xs">
            {hint}
          </span>
        ) : null}
      </button>

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={(event) => choose(event.target.files)}
        className="sr-only"
        tabIndex={-1}
        aria-hidden
      />

      {rejected.length > 0 ? (
        <ul className="border-danger-100 bg-danger-50 space-y-1 rounded-md border p-3" role="alert">
          {rejected.map((problem) => (
            <li key={problem} className="text-danger-700 flex items-start gap-2 text-xs">
              <AlertCircle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {problem}
            </li>
          ))}
        </ul>
      ) : null}

      {/*
        Only the batch gets a summary bar. A per-file bar plus a total bar plus
        a spinner is three things saying the same thing.
      */}
      {busy && items.filter((item) => item.status === 'uploading').length > 1 ? (
        <div className="flex items-center gap-3">
          <div className="bg-sunken h-1.5 flex-1 overflow-hidden rounded-full">
            <div
              className="bg-accent h-full rounded-full transition-[width] duration-200"
              style={{ width: `${overallPercent}%` }}
            />
          </div>
          <span className="text-faint tabular text-2xs">{overallPercent}% of batch</span>
        </div>
      ) : null}

      {items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((item) => (
            <UploadRow
              key={item.id}
              item={item}
              onCancel={() => cancel(item.id)}
              onRetry={() => void retry(item.id)}
              onRemove={() => remove(item.id)}
            />
          ))}
        </ul>
      ) : null}

      {/*
        Transitions only. Announcing a percentage as it changes would make a
        screen reader read a number several times a second and nothing else.
      */}
      <p aria-live="polite" className="sr-only">
        {items
          .filter((item) => item.status === 'done' || item.status === 'error')
          .map((item) =>
            item.status === 'done' ? `${item.name} uploaded.` : `${item.name} failed: ${item.error}`,
          )
          .join(' ')}
      </p>
    </div>
  );
}

function UploadRow({
  item,
  onCancel,
  onRetry,
  onRemove,
}: {
  item: UploadItem;
  onCancel: () => void;
  onRetry: () => void;
  onRemove: () => void;
}) {
  const percent = item.size > 0 ? Math.min(100, Math.round((item.loaded / item.size) * 100)) : 0;
  const uploading = item.status === 'uploading' || item.status === 'queued';

  return (
    <li className="border-line flex items-center gap-3 rounded-md border p-2.5">
      {/* A thumbnail of what they actually chose, so a wrong file is obvious. */}
      <div className="bg-sunken size-11 shrink-0 overflow-hidden rounded">
        {item.previewUrl ? (
          // Deliberately not next/image: this is a local object URL that exists
          // only in this browser, and the optimiser cannot fetch it.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.previewUrl} alt="" className="size-full object-cover" />
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-ink truncate text-xs font-medium">{item.name}</p>
          <StatusMark status={item.status} percent={percent} />
        </div>

        {uploading ? (
          <>
            <div
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Uploading ${item.name}`}
              className="bg-sunken mt-1.5 h-1.5 overflow-hidden rounded-full"
            >
              <div
                className="bg-accent h-full rounded-full transition-[width] duration-200"
                style={{ width: `${percent}%` }}
              />
            </div>

            {/* The four figures that make a slow upload bearable. */}
            <p className="text-faint tabular mt-1 text-2xs">
              {formatFileSize(item.loaded)} of {formatFileSize(item.size)}
              {item.bytesPerSecond ? ` · ${formatTransferRate(item.bytesPerSecond)}` : ''}
              {item.secondsRemaining !== null && item.secondsRemaining > 0
                ? ` · ${formatDuration(item.secondsRemaining)} left`
                : ''}
            </p>
          </>
        ) : (
          <p
            className={cn(
              'mt-0.5 text-2xs',
              item.status === 'error' ? 'text-danger-700' : 'text-faint',
            )}
          >
            {item.status === 'error'
              ? item.error
              : item.status === 'cancelled'
                ? 'Cancelled'
                : formatFileSize(item.size)}
          </p>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {item.status === 'error' || item.status === 'cancelled' ? (
          <IconButton label={`Retry ${item.name}`} onClick={onRetry}>
            <RotateCcw className="size-3.5" aria-hidden />
          </IconButton>
        ) : null}
        {uploading ? (
          <IconButton label={`Cancel ${item.name}`} onClick={onCancel}>
            <X className="size-3.5" aria-hidden />
          </IconButton>
        ) : (
          <IconButton label={`Remove ${item.name}`} onClick={onRemove}>
            <X className="size-3.5" aria-hidden />
          </IconButton>
        )}
      </div>
    </li>
  );
}

function StatusMark({ status, percent }: { status: UploadItem['status']; percent: number }) {
  if (status === 'done') {
    return (
      <span className="text-success-600 inline-flex items-center gap-1 text-2xs font-medium">
        <Check className="size-3" strokeWidth={3} aria-hidden />
        Done
      </span>
    );
  }
  if (status === 'error') {
    return <span className="text-danger-700 text-2xs font-medium">Failed</span>;
  }
  if (status === 'cancelled') {
    return <span className="text-faint text-2xs">Cancelled</span>;
  }
  return <span className="text-muted tabular text-2xs font-medium">{percent}%</span>;
}

function IconButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="text-faint hover:text-ink hover:bg-sunken grid size-7 place-items-center rounded transition-colors"
    >
      {children}
    </button>
  );
}
