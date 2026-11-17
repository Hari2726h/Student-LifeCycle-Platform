import { randomUUID } from "node:crypto";
import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { VolunteerShell } from "@/components/volunteer-shell";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Select, TextArea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { submitTutoringSession } from "../actions";

export default async function VolunteerTutoring({ searchParams }: { searchParams: Promise<{ activityId?: string; error?: string; saved?: string }> }) {
  const session = await requireRole(["VOLUNTEER"]);
  const query = await searchParams;
  const assignments = await prisma.activityAssignment.findMany({
    where: { volunteerId: session.user.id, activity: { type: "TUTORING", studentId: { not: null } } },
    include: { activity: { include: { student: { include: { user: { select: { name: true } }, college: true } } } } },
    orderBy: { activity: { startsAt: "desc" } },
  });
  const assignmentIds = assignments.map((assignment) => assignment.id);
  const sessions = await prisma.tutoringSession.findMany({
    where: { volunteerId: session.user.id, assignmentId: { in: assignmentIds } },
    orderBy: { sessionAt: "desc" },
    take: 100,
  });
  const upcoming = sessions.filter((item) => item.nextSessionAt && item.nextSessionAt >= new Date()).sort((a, b) => a.nextSessionAt!.getTime() - b.nextSessionAt!.getTime());
  const totalHours = sessions.reduce((sum, item) => sum + item.durationHours, 0);
  const selected = assignments.find((item) => item.activityId === query.activityId) ?? assignments[0];
  const studentGroups = new Map<string, typeof sessions>();
  for (const item of sessions) {
    const group = studentGroups.get(item.studentId ?? item.studentName) ?? [];
    group.push(item);
    studentGroups.set(item.studentId ?? item.studentName, group);
  }

  return (
    <VolunteerShell name={session.user.name ?? "Volunteer"}>
      <PageHeader eyebrow="Learning support" title="Tutoring" description="Manage assigned student sessions, teaching hours and learning progress." />
      {query.error && <p role="alert" className="mb-4 text-sm text-danger">{query.error}</p>}{query.saved && <p role="status" className="mb-4 text-sm text-success">Tutoring session saved to history.</p>}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Metric title="Assigned students" value={assignments.length} /><Metric title="Upcoming sessions" value={upcoming.length} /><Metric title="Completed sessions" value={sessions.filter((item) => item.attendance === "PRESENT").length} /><Metric title="Teaching hours" value={totalHours.toFixed(1)} /></div>
      <div className="mt-5 grid gap-4 xl:grid-cols-[1fr_1fr]">
        <Card><CardHeader title="Student assignments" description="Students linked to tutoring activities assigned to you." /><CardBody className="space-y-3">
          {assignments.length ? assignments.map((assignment) => <div key={assignment.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3 last:border-0 last:pb-0">
            <div><p className="font-medium">{assignment.activity.student?.user.name}</p><p className="text-sm text-ink-muted">{assignment.activity.student?.program} · {assignment.activity.student?.college.name} · {assignment.activity.name}</p><p className="text-xs text-ink-faint">{assignment.activity.subject ?? "Subject not set"} · {assignment.activity.learningLevel ?? "Learning level not set"} · assigned {assignment.assignedAt.toLocaleDateString()}</p></div><div className="flex items-center gap-3"><StatusBadge value={assignment.status} /><a href={`/volunteer/tutoring?activityId=${assignment.activityId}`} className="text-xs text-accent">Log session</a></div>
          </div>) : <p className="text-sm text-ink-muted">No tutoring activities have been assigned to you.</p>}
        </CardBody></Card>
        <Card><CardHeader title="Record a tutoring session" description="Session history is append-only; each session gets its own record." /><CardBody>
          {selected ? <form action={submitTutoringSession} className="space-y-4">
            <input type="hidden" name="idempotencyKey" value={randomUUID()} /><input type="hidden" name="studentId" value={selected.activity.studentId ?? ""} /><input type="hidden" name="studentName" value={selected.activity.student?.user.name ?? ""} />
            <input type="hidden" name="assignmentId" value={selected.id} /><p className="text-sm text-ink-muted">{selected.activity.student?.user.name} · {selected.activity.name}</p>
            <div className="grid gap-4 sm:grid-cols-2"><Field label="Subject" name="subject" required defaultValue={selected.activity.subject ?? ""} /><Field label="Topic covered" name="topic" required /><Field label="Session date" name="sessionAt" type="date" required defaultValue={new Date().toISOString().slice(0, 10)} /><Field label="Duration (hours)" name="durationHours" type="number" min="0.25" max="12" step="0.25" defaultValue="1" /><Field label="Start time" name="startTime" type="time" /><Field label="End time" name="endTime" type="time" /><Select label="Teaching mode" name="mode"><option value="OFFLINE">Offline</option><option value="ONLINE">Online</option></Select><Select label="Attendance" name="attendance"><option value="PRESENT">Present</option><option value="ABSENT">Absent</option></Select></div>
            <TextArea label="Student understanding" name="understanding" rows={2} /><TextArea label="Homework assigned" name="homework" rows={2} /><Field label="Assessment mark (0–100)" name="assessmentMark" type="number" min="0" max="100" step="0.5" /><Field label="Next session date" name="nextSessionAt" type="date" /><TextArea label="Tutor comments" name="comments" rows={3} />
            <Button type="submit">Save session</Button>
          </form> : <p className="text-sm text-ink-muted">A tutoring activity must be linked to an active student by program staff before sessions can be recorded.</p>}
        </CardBody></Card>
      </div>
      <Card className="mt-4"><CardHeader title="Student progress and session history" description="Topics, assessment marks, feedback and next-session dates" /><CardBody className="space-y-4">
        {studentGroups.size ? [...studentGroups.entries()].map(([studentKey, records]) => <section key={studentKey} className="rounded-md border border-border p-4"><h2 className="font-medium">{records[0].studentName}</h2><p className="mt-1 text-xs text-ink-faint">{new Set(records.map((item) => item.topic)).size} topics covered · {records.reduce((sum, item) => sum + item.durationHours, 0).toFixed(1)} hours · average assessment {records.filter((item) => item.assessmentMark !== null).length ? (records.reduce((sum, item) => sum + (item.assessmentMark ?? 0), 0) / records.filter((item) => item.assessmentMark !== null).length).toFixed(1) : "not recorded"}</p><div className="mt-3 space-y-2">{records.map((item) => <div key={item.id} className="border-t border-border pt-2 text-sm"><div className="flex flex-wrap justify-between gap-2"><span>{item.subject}: {item.topic}</span><span className="text-ink-muted">{item.sessionAt.toLocaleDateString()} · {item.attendance} · {item.durationHours} h</span></div>{item.understanding && <p className="text-xs text-ink-muted">Progress: {item.understanding}</p>}{item.homework && <p className="text-xs text-ink-muted">Homework: {item.homework}</p>}{item.nextSessionAt && <p className="text-xs text-accent">Next session: {item.nextSessionAt.toLocaleDateString()}</p>}</div>)}</div></section>) : <p className="text-sm text-ink-muted">Tutoring history will appear here after your first session.</p>}
      </CardBody></Card>
    </VolunteerShell>
  );
}

function Metric({ title, value }: { title: string; value: string | number }) {
  return <Card><CardBody><p className="text-sm text-ink-muted">{title}</p><p className="mt-1 font-display text-2xl">{value}</p></CardBody></Card>;
}
