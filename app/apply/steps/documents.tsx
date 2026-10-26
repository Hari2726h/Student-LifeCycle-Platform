"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t, type Lang } from "@/lib/i18n";
import { requestDocumentUploadUrlAction, confirmDocumentUploadAction } from "../actions";
import type { Document, DocumentKind } from "@prisma/client";

const SLOTS: { kind: DocumentKind; labelKey: "uploadIdProof" | "uploadMarkSheet" | "uploadIncomeProof"; required: boolean }[] = [
  { kind: "ID_PROOF", labelKey: "uploadIdProof", required: true },
  { kind: "MARK_SHEET", labelKey: "uploadMarkSheet", required: true },
  { kind: "INCOME_PROOF", labelKey: "uploadIncomeProof", required: false },
];

export function DocumentsStep({
  lang,
  documents,
}: {
  lang: Lang;
  documents: Document[];
  error?: string;
}) {
  const strings = t(lang);
  const router = useRouter();
  const [byKind, setByKind] = useState(() => Object.fromEntries(documents.map((d) => [d.kind, d])) as Partial<Record<DocumentKind, Document>>);
  const [uploading, setUploading] = useState<DocumentKind | null>(null);
  const [errors, setErrors] = useState<Partial<Record<DocumentKind, string>>>({});
  const canContinue = !!byKind["ID_PROOF"] && !!byKind["MARK_SHEET"];

  async function handleFile(kind: DocumentKind, file: File) {
    setUploading(kind);
    setErrors((prev) => ({ ...prev, [kind]: undefined }));

    const mimeType = file.type || "application/octet-stream";
    const urlResult = await requestDocumentUploadUrlAction({ fileName: file.name, mimeType, sizeBytes: file.size });
    if (!urlResult.ok) {
      setErrors((prev) => ({ ...prev, [kind]: urlResult.error }));
      setUploading(null);
      return;
    }

    // Uploaded straight to object storage — the app server never sees the bytes.
    const put = await fetch(urlResult.uploadUrl, { method: "PUT", headers: { "Content-Type": mimeType }, body: file });
    if (!put.ok) {
      setErrors((prev) => ({ ...prev, [kind]: "Upload failed — please try again" }));
      setUploading(null);
      return;
    }

    const confirmResult = await confirmDocumentUploadAction({
      kind,
      storageKey: urlResult.storageKey,
      fileName: file.name,
      mimeType,
      sizeBytes: file.size,
    });
    if (!confirmResult.ok) {
      setErrors((prev) => ({ ...prev, [kind]: confirmResult.error }));
      setUploading(null);
      return;
    }

    setByKind((prev) => ({
      ...prev,
      [kind]: { fileName: file.name, mimeType, sizeBytes: file.size } as Document,
    }));
    setUploading(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {SLOTS.map((slot) => (
        <DocumentSlot
          key={slot.kind}
          label={strings[slot.labelKey]}
          required={slot.required}
          existing={byKind[slot.kind]}
          uploading={uploading === slot.kind}
          error={errors[slot.kind]}
          uploadedLabel={strings.uploaded}
          onFile={(file) => handleFile(slot.kind, file)}
        />
      ))}

      <div className="flex gap-3 pt-2">
        <Button href="/apply?step=3" variant="secondary" className="flex-1">
          {strings.backBtn}
        </Button>
        {canContinue ? (
          <Button href="/apply?step=5" variant="primary" className="flex-1">
            {strings.continueBtn}
          </Button>
        ) : (
          <Button variant="primary" className="flex-1" disabled>
            {strings.continueBtn}
          </Button>
        )}
      </div>
    </div>
  );
}

function DocumentSlot({
  label,
  required,
  existing,
  uploading,
  error,
  uploadedLabel,
  onFile,
}: {
  label: string;
  required: boolean;
  existing?: Document;
  uploading: boolean;
  error?: string;
  uploadedLabel: string;
  onFile: (file: File) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="flex items-center gap-3 rounded-md border border-border p-3">
      <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-ink-faint">
        {uploading ? (
          <Loader2 className="size-4 animate-spin" aria-hidden />
        ) : existing ? (
          <Check className="size-4 text-success" aria-hidden />
        ) : (
          <Upload className="size-4" aria-hidden />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">
          {label}
          {required && <span className="text-danger"> *</span>}
        </p>
        {existing ? (
          <p className="truncate text-xs text-ink-faint">
            {uploadedLabel}: {existing.fileName}
          </p>
        ) : (
          <input
            ref={inputRef}
            type="file"
            accept="image/*,.pdf"
            disabled={uploading}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) onFile(file);
            }}
            className="mt-1 block w-full text-xs text-ink-muted file:mr-3 file:rounded file:border-0 file:bg-accent-soft file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-accent-strong"
          />
        )}
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      </div>
      {existing && (
        <Button type="button" variant="secondary" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
          Replace
        </Button>
      )}
      {existing && (
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.pdf"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onFile(file);
          }}
        />
      )}
    </div>
  );
}
