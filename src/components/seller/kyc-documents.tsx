'use client';

import { Check, FileUp, X } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

import { FileUpload } from '@/components/ui/file-upload';
import { CATALOG } from '@/config/business';
import type { KycDocument, SellerStatus } from '@/domain/types';
import { formatFileSize } from '@/lib/format';
import { VERIFICATION_DOCUMENTS } from '@/lib/validation/seller';
import { attachUploadedKycDocument } from '@/server/actions/onboarding';

/**
 * Verification documents.
 *
 * Optional at every stage: none is needed to apply or to start selling. They
 * are what a reviewer checks the GSTIN, bank account and pickup address against
 * when verification is due. One row per document, each empty or ticked, with
 * the same uploader the product form uses.
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
  const [, startTransition] = useTransition();

  /*
   * Which row has its uploader open.
   *
   * One row at a time: four drop zones stacked on one screen is four things
   * competing for the same gesture, and only one document is ever being chosen.
   */
  const [openRow, setOpenRow] = useState<string | null>(null);

  const editable = status !== 'SUSPENDED';

  return (
    <Card as="section">
      <header className="mb-4">
        <h2 className="text-ink text-md font-semibold">Verification documents</h2>
        <p className="text-muted mt-0.5 text-sm">
          {editable
            ? 'Keep these on file so we can verify your business when it is due. Uploading one again replaces it.'
            : 'Locked while your store is suspended.'}
        </p>
      </header>

      {rejectionReason ? (
        <div className="border-danger-100 bg-danger-50 mb-4 rounded-md border p-3">
          <p className="text-danger-700 text-xs font-medium">What needs fixing</p>
          <p className="text-danger-700/90 mt-0.5 text-sm">{rejectionReason}</p>
        </div>
      ) : null}

      <ul className="space-y-2">
        {VERIFICATION_DOCUMENTS.map((required) => {
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

    </Card>
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
                ? 'bg-success-fill grid size-5 shrink-0 place-items-center rounded-full text-white'
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
