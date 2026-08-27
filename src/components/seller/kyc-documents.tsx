'use client';

import { Check, FileUp, Send, X } from 'lucide-react';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { FileUpload } from '@/components/ui/file-upload';
import { CATALOG } from '@/config/business';
import type { KycDocument, SellerStatus } from '@/domain/types';
import { formatFileSize } from '@/lib/format';
import { REQUIRED_DOCUMENTS } from '@/lib/validation/seller';
import { attachUploadedKycDocument, submitKyc } from '@/server/actions/onboarding';

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
 *
 * The uploader is the same `<FileUpload>` the product form uses. A phone-camera
 * scan of a GST certificate is often larger than a product photo, so the
 * progress and time-remaining figures earn their place here too — and an
 * applicant who has already uploaded product shots meets a control they know.
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

  /*
   * Which row has its uploader open.
   *
   * One row at a time: four drop zones stacked on one screen is four things
   * competing for the same gesture, and only one document is ever being chosen.
   */
  const [openRow, setOpenRow] = useState<string | null>(null);

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
              open={openRow === required.type}
              onToggle={() =>
                setOpenRow((current) => (current === required.type ? null : required.type))
              }
              onUploaded={(url, fileName) => {
                startTransition(async () => {
                  const result = await attachUploadedKycDocument({
                    type: required.type,
                    url,
                    fileName,
                  });
                  if (result.ok) {
                    toast.success(`${required.label} uploaded`);
                    setOpenRow(null);
                  } else {
                    toast.error(result.error ?? 'That upload did not work.');
                  }
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
  open,
  onToggle,
  onUploaded,
}: {
  type: string;
  label: string;
  document: KycDocument | undefined;
  editable: boolean;
  open: boolean;
  onToggle: () => void;
  onUploaded: (url: string, fileName: string) => void;
}) {
  return (
    <li className="border-line rounded-md border p-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
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
              <p className="text-faint text-2xs">JPEG, PNG or a PDF-quality scan</p>
            )}
          </div>
        </div>

        {editable ? (
          <button
            type="button"
            onClick={onToggle}
            aria-expanded={open}
            className="border-line-strong text-ink hover:border-ink inline-flex shrink-0 items-center gap-1.5 rounded-sm border px-2.5 py-1.5 text-xs transition-colors"
          >
            {open ? (
              <>
                <X className="size-3.5" aria-hidden />
                Cancel
              </>
            ) : (
              <>
                <FileUp className="size-3.5" aria-hidden />
                {document ? 'Replace' : 'Upload'}
              </>
            )}
          </button>
        ) : (
          <span className="text-faint text-2xs">{document ? 'Received' : 'Not provided'}</span>
        )}
      </div>

      {editable && open ? (
        <FileUpload
          className="mt-3"
          purpose="kyc"
          multiple={false}
          /*
           * The input keeps a predictable id per document type. It is visually
           * hidden — the drop zone is the control — but the smoke suite drives
           * it directly, and a generated id would make that untestable.
           */
          inputId={`kyc-${type}`}
          accept="image/jpeg,image/png,image/webp"
          maxBytes={CATALOG.maxImageBytes}
          label={`Drop your ${label.toLowerCase()} here, or browse`}
          hint={`A clear, readable scan · up to ${formatFileSize(CATALOG.maxImageBytes)}`}
          onUploaded={(file) => {
            onUploaded(file.url, file.name);
          }}
        />
      ) : null}
    </li>
  );
}
