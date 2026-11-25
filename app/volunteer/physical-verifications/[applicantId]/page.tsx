import { randomUUID } from "node:crypto";
import { notFound, redirect } from "next/navigation";
import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { VolunteerShell } from "@/components/volunteer-shell";
import { PageHeader } from "@/components/ui/page-header";
import { BackLink } from "@/components/ui/back-link";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Select, TextArea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { FilePreviewInput } from "@/components/ui/file-preview-input";
import { StatusBadge } from "@/components/ui/badge";
import { submitPhysicalVerification } from "../../actions";

const CHECKS = [
  ["identityVerified", "Student identity verified"],
  ["addressVerified", "Address verified"],
  ["incomeVerified", "Income band verified against evidence"],
  ["housingVerified", "Housing condition verified"],
  ["householdConfirmed", "Household size confirmed"],
  ["duplicateCheckPassed", "No duplicate or returning application found"],
] as const;

export default async function PhysicalVerificationDetails({
  params,
  searchParams,
}: {
  params: Promise<{ applicantId: string }>;
  searchParams: Promise<{ activityId?: string; error?: string; errorField?: string; saved?: string }>;
}) {
  const session = await requireRole(["VOLUNTEER"]);
  const [{ applicantId }, query] = await Promise.all([params, searchParams]);
  const fieldError = (name: string) => (query.errorField === name ? query.error : undefined);
  const applicant = await prisma.applicant.findUnique({
    where: { id: applicantId },
    include: {
      preferredCollege: true,
      sensitiveInfo: true,
      verification: true,
      documents: { orderBy: { createdAt: "desc" } },
      physicalVerificationReports: { orderBy: { createdAt: "desc" }, take: 30 },
      volunteerActivities: { where: { type: "PHYSICAL_VERIFICATION", assignments: { some: { volunteerId: session.user.id } } }, select: { id: true, name: true } },
    },
  });
  if (!applicant) notFound();
  const activityAssignment = query.activityId
    ? await prisma.activityAssignment.findFirst({
        where: { activityId: query.activityId, volunteerId: session.user.id, activity: { type: "PHYSICAL_VERIFICATION", applicantId } },
        select: { activityId: true },
      })
    : null;
  if (applicant.volunteerId !== session.user.id && !activityAssignment) redirect("/volunteer/physical-verifications?error=Application+is+not+assigned+to+you");
  const activityId = activityAssignment?.activityId ?? applicant.volunteerActivities[0]?.id ?? "";
  const info = applicant.sensitiveInfo;
  const supportingDocs = applicant.documents.filter((doc) => ["HOUSE_PHOTO", "STUDENT_PHOTO", "INCOME_PROOF", "ADDRESS_PROOF", "SUPPORTING_DOCUMENT"].includes(doc.kind));

  return (
    <VolunteerShell name={session.user.name ?? "Volunteer"}>
      <BackLink href="/volunteer/physical-verifications" label="Back to physical verifications" />
      <PageHeader eyebrow="Physical verification" title={applicant.fullName} description={`Application ${applicant.id.slice(-10).toUpperCase()} · ${applicant.district}`} action={<StatusBadge value={applicant.verification?.decision ?? applicant.status} />} />
      {query.error && !query.errorField && <p role="alert" className="mb-4 rounded-md bg-danger-soft p-3 text-sm text-danger">{query.error}</p>}
      {query.saved && <p role="status" className="mb-4 rounded-md bg-success-soft p-3 text-sm text-success">Visit report and evidence saved. Your report is in the history below.</p>}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <div className="space-y-4">
          <Card><CardHeader title="Personal details" description="Application information (read only)" /><CardBody className="grid gap-3 text-sm sm:grid-cols-2">
            <Read label="Student name" value={applicant.fullName} /><Read label="Application number" value={applicant.id} /><Read label="Mobile" value={applicant.phone} /><Read label="Email" value={applicant.email ?? "Not provided"} /><Read label="Date of birth" value={applicant.dob.toLocaleDateString()} /><Read label="Gender" value={applicant.gender} /><Read label="Address" value={info ? `${info.addressLine1}${info.addressLine2 ? `, ${info.addressLine2}` : ""}, ${info.pincode}` : "Not provided"} /><Read label="District" value={applicant.district} />
          </CardBody></Card>
          <Card><CardHeader title="Academic details" description="Existing application data (read only)" /><CardBody className="grid gap-3 text-sm sm:grid-cols-2">
            <Read label="School name" value="Not recorded in application" /><Read label="Board" value="Not recorded in application" /><Read label="Board percentage" value={applicant.boardPercentage == null ? "Not provided" : `${applicant.boardPercentage}%`} /><Read label="Preferred college" value={applicant.preferredCollege?.name ?? "Not selected"} /><Read label="Course preference" value={applicant.courseInterest ?? "Not selected"} />
          </CardBody></Card>
          <Card><CardHeader title="Family and income" description="Sensitive information, visible only to the assigned volunteer and authorized staff" /><CardBody className="grid gap-3 text-sm sm:grid-cols-2">
            <Read label="Guardian" value={info?.guardianName ?? "Not provided"} /><Read label="Guardian mobile" value={info?.guardianPhone ?? "Not provided"} /><Read label="Annual family income" value={info?.annualIncomeInr == null ? "Not provided" : `₹${info.annualIncomeInr.toLocaleString("en-IN")}`} /><Read label="Household size" value={info?.householdSize == null ? "Not provided" : String(info.householdSize)} /><Read label="Family situation" value={info?.familySituation.replaceAll("_", " ") ?? "Not provided"} /><Read label="Guardian occupation" value={applicant.physicalVerificationReports[0]?.guardianOccupation ?? "Not recorded"} />
          </CardBody></Card>
          {supportingDocs.length > 0 && <Card><CardHeader title="Evidence already on file" /><CardBody className="space-y-2">{supportingDocs.map((doc) => <a key={doc.id} className="block text-sm text-accent hover:underline" href={`/api/documents/${doc.id}`}>{doc.fileName} · {doc.kind.replaceAll("_", " ")}</a>)}</CardBody></Card>}
        </div>

        <div className="space-y-4">
          <Card><CardHeader title="Field visit report" description="A new report is appended to history. It does not replace previous visits." /><CardBody>
            <form action={submitPhysicalVerification} className="space-y-4">
              <input type="hidden" name="applicantId" value={applicant.id} /><input type="hidden" name="activityId" value={activityId} /><input type="hidden" name="idempotencyKey" value={randomUUID()} />
              <div className="grid gap-4 sm:grid-cols-2"><Field label="Actual visit date and time" name="visitAt" type="datetime-local" required error={fieldError("visitAt")} /><Field label="Person met" name="personMet" /><Field label="Relationship to student" name="relationshipToStudent" /><Field label="Visit location" name="visitLocation" defaultValue={info?.addressLine1 ?? ""} /></div>
              <fieldset className="rounded-md border border-border p-3"><legend className="px-1 text-sm font-medium">Verification checklist</legend><div className="grid gap-2 text-sm sm:grid-cols-2">{CHECKS.map(([name, label]) => <label key={name} className="flex gap-2"><input type="checkbox" name={name} />{label}</label>)}<label className="flex gap-2"><input type="checkbox" name="photoEvidenceCollected" disabled /> Evidence is recorded with uploads</label></div></fieldset>
              <div className="grid gap-4 sm:grid-cols-2"><Select label="Housing condition" name="housingCondition" required placeholder="Select" error={fieldError("housingCondition")}><option value="KUTCHA">Kutcha</option><option value="SEMI_PUCCA">Semi-pucca</option><option value="PUCCA">Pucca</option></Select><Field label="Confirmed household size" name="confirmedHouseholdSize" type="number" min="1" max="30" error={fieldError("confirmedHouseholdSize")} /><Field label="Number of earning members" name="earningMembers" type="number" min="0" max="30" error={fieldError("earningMembers")} /><Field label="Number of dependents" name="dependents" type="number" min="0" max="30" error={fieldError("dependents")} /><Field label="Guardian occupation" name="guardianOccupation" /><Field label="Student interest in higher education" name="higherEducationInterest" /></div>
              <TextArea label="Family financial condition" name="financialCondition" rows={2} /><TextArea label="PV reason" name="pvReason" rows={2} /><TextArea label="Family financial circumstances" name="familyCircumstances" rows={2} /><TextArea label="Student educational interest" name="educationInterest" rows={2} /><TextArea label="Volunteer observations" name="observations" rows={3} error={fieldError("observations")} /><TextArea label="Final recommendation" name="recommendation" rows={2} />
              <div className="grid gap-4 sm:grid-cols-2"><FilePreviewInput label="House photographs" name="housePhotos" accept="image/*" multiple /><FilePreviewInput label="Student photographs" name="studentPhotos" accept="image/*" multiple /><FilePreviewInput label="Income proof" name="incomeProof" accept="image/*,application/pdf" multiple /><FilePreviewInput label="Address proof" name="addressProof" accept="image/*,application/pdf" multiple /><FilePreviewInput label="Supporting documents" name="supportingDocuments" accept="image/*,application/pdf" multiple /></div>
              <p className="text-xs text-ink-faint">Up to four images or PDFs, maximum 8 MB each. Files are stored privately and can only be retrieved by the assigned volunteer or staff.</p>
              <Select label="Verification decision" name="decision" required error={fieldError("decision")}><option value="APPROVED">Approve · Move to interview</option><option value="NEEDS_FOLLOW_UP">Needs follow-up visit</option><option value="REJECTED">Reject</option></Select>
              <Button type="submit">Submit visit report</Button>
            </form>
          </CardBody></Card>

          <Card><CardHeader title="Verification history" description={`${applicant.physicalVerificationReports.length} report(s)`} /><CardBody className="space-y-4">
            {applicant.physicalVerificationReports.length ? applicant.physicalVerificationReports.map((report) => <div key={report.id} className="border-b border-border pb-4 last:border-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{report.visitAt.toLocaleString()} · {report.personMet ?? "No contact recorded"}</p><StatusBadge value={report.decision} /></div>
              <p className="mt-1 text-xs text-ink-faint">Submitted {report.createdAt.toLocaleString()} · Housing {report.housingCondition?.replaceAll("_", " ") ?? "not recorded"} · Household {report.confirmedHouseholdSize ?? "not recorded"}</p>
              {report.observations && <p className="mt-2 text-sm text-ink-muted">{report.observations}</p>}
            </div>) : <p className="text-sm text-ink-muted">No visit reports yet.</p>}
          </CardBody></Card>
        </div>
      </div>
    </VolunteerShell>
  );
}

function Read({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-ink-faint">{label}</p><p className="mt-0.5 break-words text-ink">{value}</p></div>;
}
