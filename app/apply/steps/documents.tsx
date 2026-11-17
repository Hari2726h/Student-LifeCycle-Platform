"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t, type Lang } from "@/lib/i18n";
import { requestDocumentUploadUrlAction, confirmDocumentUploadAction } from "../actions";
import type { Document, DocumentKind } from "@prisma/client";

const SLOTS: { kind: DocumentKind; label: string; required: boolean }[] = [
  { kind: "MARK_SHEET_10", label: "10th marksheet", required: true },
  { kind: "MARK_SHEET_11", label: "11th marksheet", required: true },
  { kind: "MARK_SHEET_12", label: "12th marksheet", required: true },
  { kind: "AADHAAR_DOCUMENT", label: "Aadhaar document", required: true },
  { kind: "PASSPORT_PHOTO", label: "Passport-size photograph", required: true },
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
  const [progress, setProgress] = useState(0);
  const [errors, setErrors] = useState<Partial<Record<DocumentKind, string>>>({});
  const canContinue = SLOTS.every((slot) => !!byKind[slot.kind]);

  async function handleFile(kind: DocumentKind, file: File) {
    setUploading(kind);
    setProgress(0);
    setErrors((prev) => ({ ...prev, [kind]: undefined }));

    const mimeType = file.type || "application/octet-stream";
    const urlResult = await requestDocumentUploadUrlAction({ fileName: file.name, mimeType, sizeBytes: file.size });
    if (!urlResult.ok) {
      setErrors((prev) => ({ ...prev, [kind]: urlResult.error }));
      setUploading(null);
      return;
    }

    // Upload directly to private object storage; report transfer progress without sending file bytes through the app server.
    const uploaded = await putFile(urlResult.uploadUrl, file, mimeType, setProgress);
    if (!uploaded) {
      setErrors((prev) => ({ ...prev, [kind]: "Upload failed — please try again" }));
      setUploading(null);
      setProgress(0);
      return;
    }

    const confirmResult = await confirmDocumentUploadAction({
      kind,
      storageKey: urlResult.storageKey,
      fileName: file.name,
    });
    if (!confirmResult.ok) {
      setErrors((prev) => ({ ...prev, [kind]: confirmResult.error }));
      setUploading(null);
      setProgress(0);
      return;
    }

    setByKind((prev) => ({
      ...prev,
      [kind]: { fileName: file.name, mimeType, sizeBytes: file.size } as Document,
    }));
    setUploading(null);
    setProgress(0);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {SLOTS.map((slot) => (
        <DocumentSlot
          key={slot.kind}
          label={slot.label}
          required={slot.required}
          existing={byKind[slot.kind]}
          uploading={uploading === slot.kind}
          progress={progress}
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
  progress,
  error,
  uploadedLabel,
  onFile,
}: {
  label: string;
  required: boolean;
  existing?: Document;
  uploading: boolean;
  progress: number;
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
        {existing ? <a href={`/api/documents/${existing.id}`} className="block truncate text-xs text-accent hover:underline">{uploadedLabel}: {existing.fileName}</a> : <p className="text-xs text-ink-faint">Images and PDF files · up to 8 MB</p>}
        <input
          ref={inputRef}
          type="file"
          accept="image/*,.pdf"
          disabled={uploading}
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            if (file) onFile(file);
          }}
          className="sr-only"
        />
        {uploading && <div className="mt-2"><div className="h-1.5 overflow-hidden rounded bg-surface-sunken"><div className="h-full bg-accent transition-[width]" style={{ width: `${progress}%` }} /></div><p className="mt-1 text-xs text-ink-faint">Uploading {progress}%</p></div>}
        {error && <p className="mt-1 text-xs text-danger">{error}</p>}
      </div>
      {existing && (
        <Button type="button" variant="secondary" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
          Replace
        </Button>
      )}
      {!existing && (
        <Button type="button" variant="secondary" size="sm" disabled={uploading} onClick={() => inputRef.current?.click()}>
          Choose file
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

function putFile(url: string, file: File, mimeType: string, onProgress: (value: number) => void) {
  return new Promise<boolean>((resolve) => {
    const request = new XMLHttpRequest();
    request.open("PUT", url);
    request.setRequestHeader("Content-Type", mimeType);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.min(100, Math.round((event.loaded / event.total) * 100)));
    };
    request.onload = () => resolve(request.status >= 200 && request.status < 300);
    request.onerror = () => resolve(false);
    request.onabort = () => resolve(false);
    request.send(file);
  });
}
