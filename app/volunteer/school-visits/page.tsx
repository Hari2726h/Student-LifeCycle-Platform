import { randomUUID } from "node:crypto";
import Link from "next/link";
import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { VolunteerShell } from "@/components/volunteer-shell";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, TextArea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { recordSchoolVisitInterest } from "../actions";

export default async function SchoolVisits({ searchParams }: { searchParams: Promise<{ error?: string; saved?: string }> }) {
  const session = await requireRole(["VOLUNTEER"]);
  const query = await searchParams;
  const assignments = await prisma.activityAssignment.findMany({
    where: { volunteerId: session.user.id, activity: { type: "SCHOOL_VISIT" } },
    include: { activity: { include: { schoolInterests: { orderBy: { createdAt: "desc" }, take: 30 } } } },
    orderBy: { activity: { startsAt: "desc" } },
  });
  const selected = assignments.find((assignment) => assignment.status !== "COMPLETED") ?? assignments[0];
  return (
    <VolunteerShell name={session.user.name ?? "Volunteer"}>
      <PageHeader eyebrow="Community outreach" title="School visits" description="Record your visit report and track student interest. Contact numbers are stored only when the student has consented." />
      {query.error && <p role="alert" className="mb-4 text-sm text-danger">{query.error}</p>}{query.saved && <p role="status" className="mb-4 text-sm text-success">Student interest saved.</p>}
      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Card><CardHeader title="Visit assignments" description="School visit activities assigned to you." /><CardBody className="space-y-3">
          {assignments.length ? assignments.map((assignment) => <div key={assignment.id} className="border-b border-border pb-3 last:border-0 last:pb-0">
            <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{assignment.activity.name}</p><StatusBadge value={assignment.status} /></div>
            <p className="mt-1 text-sm text-ink-muted">{assignment.activity.schoolName ?? assignment.activity.name} · {assignment.activity.schoolDistrict ?? "District not set"}</p>
            <dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2"><div><dt className="text-ink-faint">School address</dt><dd>{assignment.activity.schoolAddress ?? assignment.activity.location ?? "Not provided"}</dd></div><div><dt className="text-ink-faint">Visit date</dt><dd>{assignment.activity.startsAt.toLocaleDateString()}</dd></div><div><dt className="text-ink-faint">Contact person</dt><dd>{assignment.activity.schoolContactPerson ?? "Not provided"}</dd></div><div><dt className="text-ink-faint">School contact</dt><dd>{assignment.activity.schoolContactNumber ?? "Not provided"}</dd></div><div><dt className="text-ink-faint">Assigned volunteer</dt><dd>{session.user.name ?? "You"}</dd></div><div><dt className="text-ink-faint">Visit status</dt><dd>{assignment.status.replaceAll("_", " ")}</dd></div></dl>
            <Link className="mt-2 inline-block text-sm text-accent" href={`/volunteer/activities/${assignment.activityId}#report`}>Open visit report →</Link>
            {assignment.activity.schoolInterests.length > 0 && <p className="mt-1 text-xs text-ink-faint">{assignment.activity.schoolInterests.length} student interest record(s)</p>}
          </div>) : <p className="text-sm text-ink-muted">No school visit activities are assigned to you.</p>}
        </CardBody></Card>
        <Card><CardHeader title="Student interest tracking" description="Record a prospective student. This does not create an application or duplicate applicant record." /><CardBody>
          {selected ? <form action={recordSchoolVisitInterest} className="space-y-4">
            <input type="hidden" name="activityId" value={selected.activityId} /><input type="hidden" name="idempotencyKey" value={randomUUID()} />
            <p className="text-sm text-ink-muted">{selected.activity.schoolName ?? selected.activity.name} · {selected.activity.schoolAddress ?? selected.activity.location ?? "School location not provided"} · {selected.activity.startsAt.toLocaleDateString()}</p>
            <div className="grid gap-4 sm:grid-cols-2"><Field label="Student name" name="studentName" required /><Field label="Class / year" name="classOrYear" required /><Field label="Contact number (consent required)" name="contactNumber" type="tel" /><Field label="Course interest" name="courseInterest" /></div>
            <label className="flex items-start gap-2 text-sm"><input className="mt-0.5" type="checkbox" name="contactConsent" /><span>The student has explicitly consented to Maatram contacting them using this number.</span></label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="financialSupportNeeded" /> Financial support may be needed</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="followUpRequired" /> Follow-up required</label>
            <TextArea label="Higher education interest" name="higherEducationInterest" rows={2} /><TextArea label="Notes" name="notes" rows={2} />
            <Button type="submit">Save student interest</Button>
          </form> : <p className="text-sm text-ink-muted">A school visit assignment is required before student interest can be recorded.</p>}
        </CardBody></Card>
      </div>
      <Card className="mt-4"><CardHeader title="Your recent student interests" /><CardBody className="space-y-3">
        {assignments.flatMap((assignment) => assignment.activity.schoolInterests.filter((interest) => interest.recordedById === session.user.id).map((interest) => ({ ...interest, activityName: assignment.activity.name }))).map((interest) => <div key={interest.id} className="flex flex-wrap items-start justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0">
          <div><p className="font-medium">{interest.studentName} · {interest.classOrYear}</p><p className="text-sm text-ink-muted">{interest.activityName} · {interest.courseInterest ?? "Course interest not recorded"}</p><p className="text-xs text-ink-faint">{interest.contactConsent ? `Contact consent recorded · ${interest.contactNumber}` : "No contact details stored; consent not given"}{interest.followUpRequired ? " · Follow-up needed" : ""} · Higher education: {interest.higherEducationInterest || "not recorded"} · Financial support: {interest.financialSupportNeeded ? "required" : "not marked"}</p><div className="mt-2 flex items-center gap-3"><StatusBadge value={interest.status} />{!interest.applicantId && !["APPLIED", "NOT_INTERESTED"].includes(interest.status) && <Link className="text-sm font-medium text-accent" href="/apply">Help start an application</Link>}</div></div>
        </div>)}
        {!assignments.some((assignment) => assignment.activity.schoolInterests.some((interest) => interest.recordedById === session.user.id)) && <p className="text-sm text-ink-muted">No student interests recorded yet.</p>}
      </CardBody></Card>
    </VolunteerShell>
  );
}
