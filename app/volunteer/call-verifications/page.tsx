import { randomUUID } from "node:crypto";
import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { VolunteerShell } from "@/components/volunteer-shell";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Select, TextArea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { submitCallVerification } from "../actions";

export default async function CallVerifications({ searchParams }: { searchParams: Promise<{ activityId?: string; error?: string; saved?: string }> }) {
  const session = await requireRole(["VOLUNTEER"]);
  const query = await searchParams;
  const assignments = await prisma.activityAssignment.findMany({
    where: { volunteerId: session.user.id, activity: { type: "CALL_VERIFICATION", applicantId: { not: null } } },
    include: { activity: { include: { applicant: true } } },
    orderBy: { activity: { startsAt: "desc" } },
  });
  const applicantIds = [...new Set(assignments.map((assignment) => assignment.activity.applicantId).filter((id): id is string => Boolean(id)))];
  const legacyApplicants = await prisma.applicant.findMany({
    where: { volunteerId: session.user.id, status: { in: ["SUBMITTED", "UNDER_VERIFICATION"] } },
    select: { id: true, fullName: true, phone: true, email: true, district: true, status: true },
    orderBy: { updatedAt: "desc" },
  });
  const activityApplicants = applicantIds.length ? await prisma.applicant.findMany({
    where: { id: { in: applicantIds }, status: { in: ["SUBMITTED", "UNDER_VERIFICATION"] } },
    select: { id: true, fullName: true, phone: true, email: true, district: true, status: true },
  }) : [];
  const applicantMap = new Map([...legacyApplicants, ...activityApplicants].map((applicant) => [applicant.id, applicant]));
  const applicants = [...applicantMap.values()];
  const visibleApplicantIds = applicants.map((applicant) => applicant.id);
  const selectedActivity = assignments.find((assignment) => assignment.activityId === query.activityId);
  const calls = visibleApplicantIds.length ? await prisma.callVerification.findMany({
    where: { applicantId: { in: visibleApplicantIds } },
    include: { applicant: { select: { id: true, fullName: true, phone: true } }, volunteer: { select: { name: true } } },
    orderBy: [{ applicantId: "asc" }, { attemptNumber: "desc" }],
    take: 200,
  }) : [];
  const recentCalls = [...calls].sort((a, b) => b.calledAt.getTime() - a.calledAt.getTime()).slice(0, 40);

  return (
    <VolunteerShell name={session.user.name ?? "Volunteer"}>
      <PageHeader eyebrow="Verification" title="Call verification" description="Each attempt is saved as a separate record. Physical verification has its own page and report." />
      {query.error && <p role="alert" className="mb-4 text-sm text-danger">{query.error}</p>}
      {query.saved && <p role="status" className="mb-4 text-sm text-success">Call attempt saved to history.</p>}
      <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Card><CardHeader title="Record a call attempt" description="Select an application assigned to you." /><CardBody>
          {applicants.length ? <form action={submitCallVerification} className="space-y-4">
            <input type="hidden" name="idempotencyKey" value={randomUUID()} />
            <input type="hidden" name="activityId" value={selectedActivity?.activityId ?? ""} />
            <Select label="Student application" name="applicantId" required placeholder="Select an assigned applicant" defaultValue={selectedActivity?.activity.applicantId ?? ""}>
              {applicants.map((applicant) => <option key={applicant.id} value={applicant.id}>{applicant.fullName} · {applicant.phone} · {applicant.email ?? "no email"} · {applicant.district}</option>)}
            </Select>
            <div className="grid gap-4 sm:grid-cols-2"><Field label="Call date and time" name="calledAt" type="datetime-local" required /><Select label="Call status" name="status" required placeholder="Select status"><option value="CONNECTED">Connected</option><option value="NOT_REACHABLE">Not reachable</option><option value="SWITCHED_OFF">Switched off</option><option value="CALL_LATER">Call later</option><option value="WRONG_NUMBER">Wrong number</option><option value="VERIFICATION_COMPLETED">Verification completed</option><option value="REJECTED">Reject application</option></Select><Field label="Alternate mobile" name="alternateMobile" type="tel" /><Field label="Person who answered" name="personAnswered" /></div>
            <fieldset className="rounded-md border border-border p-3"><legend className="px-1 text-sm font-medium">Call verification checklist</legend><div className="grid gap-2 text-sm sm:grid-cols-2">{[["identityConfirmed", "Student identity confirmed"], ["addressConfirmed", "Address confirmed"], ["familyConfirmed", "Family details confirmed"], ["incomeConfirmed", "Income details confirmed"], ["educationConfirmed", "Education details confirmed"], ["admissionInterest", "Interested in admission"]].map(([name, label]) => <label key={name} className="flex gap-2"><input type="checkbox" name={name} />{label}</label>)}</div></fieldset>
            <div className="grid gap-4 sm:grid-cols-2"><Field label="Student availability" name="studentAvailability" /><Field label="Next follow-up date" name="nextFollowUpAt" type="datetime-local" /></div>
            <label className="flex gap-2 text-sm"><input type="checkbox" name="followUpRequired" /> Follow-up required</label>
            <TextArea label="Volunteer comments" name="comments" rows={3} />
            <Button type="submit">Save call attempt</Button>
          </form> : <p className="text-sm text-ink-muted">No applicants or call activities are assigned to you yet.</p>}
        </CardBody></Card>

        <Card><CardHeader title="Call history" description="The latest 40 calls for applicants you are authorized to support." /><CardBody className="space-y-3">
          {recentCalls.length ? recentCalls.map((call) => <div key={call.id} className="border-b border-border pb-3 last:border-0 last:pb-0">
            <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-medium">{call.applicant.fullName} · attempt {call.attemptNumber}</p><p className="text-xs text-ink-faint">{call.calledAt.toLocaleString()} · {call.volunteer.name}</p></div><StatusBadge value={call.status} /></div>
            {call.comments && <p className="mt-2 text-sm text-ink-muted">{call.comments}</p>}
            {call.followUpRequired && <p className="mt-1 text-xs text-warning">Follow-up {call.nextFollowUpAt?.toLocaleDateString() ?? "required"}</p>}
          </div>) : <p className="text-sm text-ink-muted">No call attempts recorded yet.</p>}
        </CardBody></Card>
      </div>
    </VolunteerShell>
  );
}
