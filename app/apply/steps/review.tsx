import { Button } from "@/components/ui/button";
import { t, type Lang } from "@/lib/i18n";
import { submitApplicationAction } from "../actions";
import type { Applicant, ApplicantSensitiveInfo, College, Document } from "@prisma/client";

export function ReviewStep({
  lang,
  applicant,
  college,
  info,
  documents,
  error,
}: {
  lang: Lang;
  applicant: Applicant;
  college: College | null;
  info: ApplicantSensitiveInfo | null;
  documents: Document[];
  error?: string;
}) {
  const strings = t(lang);

  return (
    <div className="space-y-5">
      <p className="text-sm text-ink-muted">{strings.reviewNotice}</p>
      {error && <p className="text-sm text-danger">{error}</p>}

      <ReviewSection title={strings.stepPersonal}>
        <Row label={strings.fullName} value={applicant.fullName} />
        <Row label={strings.dob} value={applicant.dob.toLocaleDateString()} />
        <Row label={strings.district} value={applicant.district} />
      </ReviewSection>

      <ReviewSection title={strings.stepAcademic}>
        <Row label={strings.boardPercentage} value={applicant.boardPercentage ? `${applicant.boardPercentage}%` : "—"} />
        <Row label={strings.courseInterest} value={applicant.courseInterest ?? "—"} />
        <Row label={strings.preferredCollege} value={college ? college.name : "No preference"} />
      </ReviewSection>

      <ReviewSection title={strings.stepFamily}>
        <Row label={strings.addressLine1} value={info ? `${info.addressLine1}, ${info.pincode}` : "—"} />
        <Row label={strings.guardianName} value={info?.guardianName ?? "—"} />
        <Row label={strings.familySituation} value={info?.familySituation.replaceAll("_", " ") ?? "—"} />
      </ReviewSection>

      <ReviewSection title={strings.stepDocuments}>
        {documents.length === 0 ? (
          <p className="text-sm text-ink-faint">None uploaded</p>
        ) : (
          documents.map((d) => <Row key={d.id} label={d.kind.replaceAll("_", " ")} value={d.fileName} />)
        )}
      </ReviewSection>

      <form action={submitApplicationAction} className="flex gap-3 pt-2">
        <Button href="/apply?step=4" variant="secondary" className="flex-1">
          {strings.backBtn}
        </Button>
        <Button type="submit" variant="primary" className="flex-1">
          {strings.submitApplication}
        </Button>
      </form>
    </div>
  );
}

function ReviewSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border p-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-ink-faint">{title}</p>
      <dl className="mt-2 space-y-1">{children}</dl>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 text-sm">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="truncate text-right text-ink">{value}</dd>
    </div>
  );
}
