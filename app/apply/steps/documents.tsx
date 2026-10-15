import { Check, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { t, type Lang } from "@/lib/i18n";
import { uploadDocumentAction } from "../actions";
import type { Document, DocumentKind } from "@prisma/client";

const SLOTS: { kind: DocumentKind; labelKey: "uploadIdProof" | "uploadMarkSheet" | "uploadIncomeProof"; required: boolean }[] = [
  { kind: "ID_PROOF", labelKey: "uploadIdProof", required: true },
  { kind: "MARK_SHEET", labelKey: "uploadMarkSheet", required: true },
  { kind: "INCOME_PROOF", labelKey: "uploadIncomeProof", required: false },
];

export function DocumentsStep({
  lang,
  documents,
  error,
}: {
  lang: Lang;
  documents: Document[];
  error?: string;
}) {
  const strings = t(lang);
  const byKind = Object.fromEntries(documents.map((d) => [d.kind, d]));
  const canContinue = !!byKind["ID_PROOF"] && !!byKind["MARK_SHEET"];

  return (
    <div className="space-y-4">
      {error && <p className="text-sm text-danger">{error}</p>}
      {SLOTS.map((slot) => {
        const existing = byKind[slot.kind];
        return (
          <form key={slot.kind} action={uploadDocumentAction} className="flex items-center gap-3 rounded-md border border-border p-3">
            <input type="hidden" name="kind" value={slot.kind} />
            <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-surface-sunken text-ink-faint">
              {existing ? <Check className="size-4 text-success" aria-hidden /> : <Upload className="size-4" aria-hidden />}
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-ink">
                {strings[slot.labelKey]}
                {slot.required && <span className="text-danger"> *</span>}
              </p>
              {existing ? (
                <p className="truncate text-xs text-ink-faint">
                  {strings.uploaded}: {existing.fileName}
                </p>
              ) : (
                <input
                  type="file"
                  name="file"
                  required
                  accept="image/*,.pdf"
                  className="mt-1 block w-full text-xs text-ink-muted file:mr-3 file:rounded file:border-0 file:bg-accent-soft file:px-2.5 file:py-1 file:text-xs file:font-medium file:text-accent-strong"
                />
              )}
            </div>
            <Button type="submit" variant="secondary" size="sm">
              {existing ? "Replace" : "Upload"}
            </Button>
          </form>
        );
      })}

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
