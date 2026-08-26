'use client';

import { Check, FileUp, Send } from 'lucide-react';
import { useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

import type { KycDocument, SellerStatus } from '@/domain/types';
import { REQUIRED_DOCUMENTS } from '@/lib/validation/seller';
import { submitKyc, uploadKycDocument } from '@/server/actions/onboarding';

/**
 * The document step of onboarding.
 *
 * Four rows, each either empty or ticked. A progress bar would be decoration;
 * what an applicant needs is to see at a glance which of the four is still
 * missing, and to be unable to submit until none are.
 *
 * Uploads are locked once the application is in review. An applicant who could
 * still swap documents afterwards would mean the reviewer approves a set that
 * is not the one they read.
 */
export function KycDocuments({
  status,
  documents,
  rejectionReason,
}: {
  status: SellerStatus;
  documents: KycDocument[];
  rejectionReason: string | null;
}) {
  const [pending, startTransition] = useTransition();
  const [uploading, setUploading] = useState<string | null>(null);

  const editable = status === 'ONBOARDING' || status === 'REJECTED';
  const uploaded = new Set(documents.map((document) => document.type));
  const missing = REQUIRED_DOCUMENTS.filter((document) => !uploaded.has(document.type));

  const submit = () => {
    startTransition(async () => {
      const result = await submitKyc();
      if (result.ok) {
        toast.success('Sent for review. We usually come back within two working days.');
      } else if (result.missing?.length) {
        toast.error(`Still needed: ${result.missing.join(', ')}`);
      } else {
        toast.error(result.error ?? 'That did not work.');
      }
    });
  };

  return (
    <section className="border-line bg-raised rounded-lg border p-5">
      <header className="mb-4">
        <h2 className="text-ink text-md font-semibold">Verification documents</h2>
        <p className="text-muted mt-0.5 text-sm">
          {editable
            ? 'All four are needed before we can review your application.'
            : 'Locked while your application is in review.'}
        </p>
      </header>

      {rejectionReason ? (
        <div className="border-danger-100 bg-danger-50 mb-4 rounded-md border p-3">
          <p className="text-danger-700 text-xs font-medium">What needs fixing</p>
          <p className="text-danger-700/90 mt-0.5 text-sm">{rejectionReason}</p>
        </div>
      ) : null}

      <ul className="space-y-2">
        {REQUIRED_DOCUMENTS.map((required) => {
          const existing = documents.find((document) => document.type === required.type);
          return (
            <DocumentRow
              key={required.type}
              type={required.type}
              label={required.label}
              document={existing}
              editable={editable}
              busy={uploading === required.type}
              onUpload={(file) => {
                setUploading(required.type);
                const formData = new FormData();
                formData.set('type', required.type);
                formData.set('file', file);

                startTransition(async () => {
                  const result = await uploadKycDocument(formData);
                  setUploading(null);
                  if (result.ok) toast.success(`${required.label} uploaded`);
                  else toast.error(result.error ?? 'That upload did not work.');
                });
              }}
            />
          );
        })}
      </ul>

      {editable ? (
        <div className="border-line mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
          <p className="text-faint text-2xs">
            {missing.length === 0
              ? 'Everything we need is here.'
              : `Still needed: ${missing.map((document) => document.label).join(', ')}.`}
          </p>
          <button
            type="button"
            onClick={submit}
            disabled={pending || missing.length > 0}
            className="bg-ink text-canvas disabled:bg-line-strong inline-flex shrink-0 items-center gap-1.5 rounded-md px-3.5 py-2 text-xs font-medium disabled:cursor-not-allowed"
          >
            <Send className="size-3.5" aria-hidden />
            {pending ? 'Sending…' : 'Send for review'}
          </button>
        </div>
      ) : null}
    </section>
  );
}

function DocumentRow({
  type,
  label,
  document,
  editable,
  busy,
  onUpload,
}: {
  type: string;
  label: string;
  document: KycDocument | undefined;
  editable: boolean;
  busy: boolean;
  onUpload: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = `kyc-${type}`;

  return (
    <li className="border-line flex flex-wrap items-center justify-between gap-3 rounded-md border p-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          aria-hidden
          className={
            document
              ? 'bg-success-500 grid size-5 shrink-0 place-items-center rounded-full text-white'
              : 'border-line-strong grid size-5 shrink-0 place-items-center rounded-full border'
          }
        >
          {document ? <Check className="size-3" strokeWidth={3} /> : null}
        </span>

        <div className="min-w-0">
          <p className="text-ink text-xs font-medium">{label}</p>
          {document ? (
            <p className="text-faint truncate text-2xs">{document.fileName}</p>
          ) : (
            <p className="text-faint text-2xs">JPEG, PNG or PDF-quality scan</p>
          )}
        </div>
      </div>

      {editable ? (
        <>
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={busy}
            className="border-line-strong text-ink hover:border-ink inline-flex shrink-0 items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-xs transition-colors disabled:cursor-wait"
          >
            <FileUp className="size-3.5" aria-hidden />
            {busy ? 'Uploading…' : document ? 'Replace' : 'Upload'}
          </button>

          {/* Labelled for screen readers; the visible control is the button. */}
          <label htmlFor={inputId} className="sr-only">
            Upload {label}
          </label>
          <input
            id={inputId}
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) onUpload(file);
              event.target.value = '';
            }}
            className="sr-only"
          />
        </>
      ) : (
        <span className="text-faint text-2xs">{document ? 'Received' : 'Not provided'}</span>
      )}
    </li>
  );
}
