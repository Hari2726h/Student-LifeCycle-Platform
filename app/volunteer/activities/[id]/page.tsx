import { randomUUID } from "node:crypto";
import Link from "next/link";
import { notFound } from "next/navigation";
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
import { startVolunteerActivity, submitActivityReport } from "../../actions";

export default async function VolunteerActivityDetails({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ error?: string; submitted?: string }>;
}) {
  const session = await requireRole(["VOLUNTEER"]);
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const assignment = await prisma.activityAssignment.findFirst({
    where: { activityId: id, volunteerId: session.user.id },
    include: {
      activity: { include: { applicant: { select: { id: true, fullName: true } }, student: { include: { user: { select: { name: true } } } } } },
      reports: { include: { evidence: true, reviewedBy: { select: { name: true } } }, orderBy: { createdAt: "desc" } },
    },
  });
  if (!assignment) notFound();
  const { activity } = assignment;
  const studentName = activity.applicant?.fullName ?? activity.student?.user.name;
  const reportEnabled = !["COMPLETED", "CANCELLED"].includes(assignment.status);

  return (
    <VolunteerShell name={session.user.name ?? "Volunteer"}>
      <BackLink href="/volunteer/activities" label="Back to activities" />
      <PageHeader eyebrow={activity.type.replaceAll("_", " ")} title={activity.name} description={activity.description} action={<StatusBadge value={assignment.status} />} />
      {query.error && <p role="alert" className="mb-4 rounded-md bg-danger-soft p-3 text-sm text-danger">{query.error}</p>}
      {query.submitted && <p role="status" className="mb-4 rounded-md bg-success-soft p-3 text-sm text-success">Your report was submitted for staff review.</p>}
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          <Card><CardHeader title="Assignment" /><CardBody className="grid gap-3 text-sm sm:grid-cols-2">
            <p><span className="text-ink-faint">Activity ID </span>{activity.id}</p>
            <p><span className="text-ink-faint">Priority </span>{activity.priority}</p>
            <p><span className="text-ink-faint">Location </span>{activity.location ?? "Not provided"}</p>
            {activity.type === "SCHOOL_VISIT" && <>
              <p><span className="text-ink-faint">School </span>{activity.schoolName ?? activity.name}</p>
              <p><span className="text-ink-faint">School address </span>{activity.schoolAddress ?? activity.location ?? "Not provided"}</p>
              <p><span className="text-ink-faint">District </span>{activity.schoolDistrict ?? "Not provided"}</p>
              <p><span className="text-ink-faint">Contact person </span>{activity.schoolContactPerson ?? "Not provided"}</p>
              <p><span className="text-ink-faint">School contact </span>{activity.schoolContactNumber ?? "Not provided"}</p>
            </>}
            <p><span className="text-ink-faint">Student </span>{studentName ?? "Not linked"}</p>
            {activity.subject && <p><span className="text-ink-faint">Subject </span>{activity.subject}</p>}
            {activity.learningLevel && <p><span className="text-ink-faint">Learning level </span>{activity.learningLevel}</p>}
            <p><span className="text-ink-faint">Start </span>{activity.startsAt.toLocaleString()}</p>
            <p><span className="text-ink-faint">Due </span>{activity.dueAt?.toLocaleString() ?? "No due date"}</p>
            {assignment.responsibility && <p className="sm:col-span-2"><span className="text-ink-faint">Your responsibility </span>{assignment.responsibility}</p>}
          </CardBody></Card>

          {activity.type === "PHYSICAL_VERIFICATION" && activity.applicantId && <Card><CardBody><p className="text-sm text-ink-muted">Physical visits use a dedicated checklist and append-only report.</p><Link className="mt-3 inline-block text-sm font-medium text-accent" href={`/volunteer/physical-verifications/${activity.applicantId}?activityId=${activity.id}`}>Open physical verification →</Link></CardBody></Card>}
          {activity.type === "CALL_VERIFICATION" && <Card><CardBody><p className="text-sm text-ink-muted">Call attempts are recorded separately and kept as history.</p><Link className="mt-3 inline-block text-sm font-medium text-accent" href={`/volunteer/call-verifications?activityId=${activity.id}`}>Open call verification →</Link></CardBody></Card>}
          {activity.type === "TUTORING" && <Card><CardBody><p className="text-sm text-ink-muted">Record a session to track the topic, attendance, homework and progress.</p><Link className="mt-3 inline-block text-sm font-medium text-accent" href={`/volunteer/tutoring?activityId=${activity.id}`}>Open tutoring sessions →</Link></CardBody></Card>}

          {reportEnabled && ["SCHOOL_VISIT", "SANTA_PROGRAMME", "OTHER"].includes(activity.type) && <Card id="report">
            <CardHeader title={activity.type === "SCHOOL_VISIT" ? "School visit report" : activity.type === "SANTA_PROGRAMME" ? "Programme participation report" : "Activity report"} description="Your submission is kept as history and reviewed by program staff." />
            <CardBody><form action={submitActivityReport} className="space-y-4">
              <input type="hidden" name="assignmentId" value={assignment.id} /><input type="hidden" name="idempotencyKey" value={randomUUID()} />
              <div className="grid gap-4 sm:grid-cols-2"><Field label="Hours contributed" type="number" name="hours" min="0" max="24" step="0.25" defaultValue="1" />
                {activity.type === "SCHOOL_VISIT" && <>
                  <Field label="School name" name="schoolName" defaultValue={activity.schoolName ?? activity.name} required />
                  <Field label="School address" name="schoolAddress" defaultValue={activity.schoolAddress ?? activity.location ?? ""} />
                  <Field label="District" name="district" defaultValue={activity.schoolDistrict ?? ""} />
                  <Field label="School contact number" name="schoolContactNumber" type="tel" defaultValue={activity.schoolContactNumber ?? ""} />
                  <Field label="Actual visit date" name="visitDate" type="date" defaultValue={activity.startsAt.toISOString().slice(0, 10)} required />
                  <Field label="School representative" name="schoolRepresentative" defaultValue={activity.schoolContactPerson ?? ""} />
                  <Field label="Students interacted with" name="studentsInteracted" type="number" min="0" defaultValue="0" />
                  <Field label="Classes visited" name="classesVisited" placeholder="e.g. 10th and 11th" />
                  <Field label="Interested students" name="interestedStudents" type="number" min="0" defaultValue="0" />
                  <Field label="Potential applicants" name="potentialApplicants" type="number" min="0" defaultValue="0" />
                </>}
                {activity.type === "SANTA_PROGRAMME" && <>
                  <Select label="Assigned role" name="assignedRole" placeholder="Select role"><option>Gift Packing</option><option>Gift Distribution</option><option>Event Coordination</option><option>Decoration</option><option>Child Engagement</option><option>Photography</option><option>Event Support</option></Select>
                  <Field label="Attendance" name="attendanceCount" type="number" min="0" max="10000" defaultValue="0" />
                  <Field label="Gifts distributed" name="giftsDistributed" type="number" min="0" defaultValue="0" />
                </>}
              </div>
              {activity.type === "SCHOOL_VISIT" && <div className="grid gap-2 sm:grid-cols-2 text-sm">
                <label className="flex gap-2"><input type="checkbox" name="awarenessSession" /> Awareness session conducted</label><label className="flex gap-2"><input type="checkbox" name="higherEducationGuidance" /> Higher education guidance provided</label><label className="flex gap-2"><input type="checkbox" name="maatramIntroduction" /> Maatram introduction completed</label><label className="flex gap-2"><input type="checkbox" name="followUpRequired" /> Follow-up required</label>
              </div>}
              {activity.type === "SANTA_PROGRAMME" && <label className="flex gap-2 text-sm"><input type="checkbox" name="eventAttended" /> I attended this event</label>}
              <FilePreviewInput label={activity.type === "SCHOOL_VISIT" ? "Photos and supporting documents" : activity.type === "SANTA_PROGRAMME" ? "Event photos and videos" : "Supporting materials"} name="evidence" multiple accept={activity.type === "SANTA_PROGRAMME" ? "image/*,video/mp4,video/webm,video/quicktime" : "image/*,application/pdf"} />
              {activity.type === "OTHER" && <><TextArea label="Summary" name="summary" rows={3} required /><TextArea label="Outcome" name="outcome" rows={2} /></>}
              {activity.type === "TUTORING" && <TextArea label="Session summary" name="summary" rows={3} />}
              {activity.type === "SCHOOL_VISIT" && <TextArea label="Volunteer comments" name="comments" rows={3} />}
              {activity.type === "SANTA_PROGRAMME" && <TextArea label="Activities and comments" name="activitiesConducted" rows={3} />}
              <TextArea label="Additional comments" name="comments" rows={3} />
              <Button type="submit">Submit report</Button>
            </form></CardBody>
          </Card>}

          {assignment.reports.length > 0 && <Card><CardHeader title="Report history" /><CardBody className="space-y-4">
            {assignment.reports.map((report) => <div key={report.id} className="border-b border-border pb-4 last:border-0 last:pb-0">
              <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm font-medium">Submitted {report.createdAt.toLocaleString()}</p><StatusBadge value={report.reviewStatus} /></div>
              <p className="mt-1 text-sm text-ink-muted">{report.hours} hours · {report.reviewedBy ? `Reviewed by ${report.reviewedBy.name}` : "Awaiting review"}</p>
              {report.reviewNote && <p className="mt-1 text-sm">Staff note: {report.reviewNote}</p>}
              {report.evidence.map((file) => <a key={file.id} className="mr-3 mt-2 inline-block text-xs text-accent" href={`/api/activity-evidence/${file.id}`}>{file.fileName}</a>)}
            </div>)}
          </CardBody></Card>}
        </div>
        <Card className="h-fit"><CardHeader title="Actions" /><CardBody className="space-y-3">
          {!["COMPLETED", "CANCELLED"].includes(assignment.status) && <form action={startVolunteerActivity}><input type="hidden" name="assignmentId" value={assignment.id} /><Button type="submit" className="w-full">Start or resume</Button></form>}
          <Link className="block rounded-md border border-border px-3 py-2 text-center text-sm hover:bg-surface-sunken" href="/volunteer/expenses">Submit an expense</Link>
          <p className="text-xs text-ink-faint">Priority {activity.priority.toLowerCase()} · assigned {assignment.assignedAt.toLocaleDateString()}</p>
        </CardBody></Card>
      </div>
    </VolunteerShell>
  );
}
