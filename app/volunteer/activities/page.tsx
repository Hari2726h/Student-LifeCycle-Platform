import Link from "next/link";
import type { Prisma, VolunteerActivityStatus, VolunteerActivityType } from "@prisma/client";
import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { VolunteerShell } from "@/components/volunteer-shell";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { startVolunteerActivity } from "../actions";

type Search = { q?: string; type?: string; status?: string; page?: string };

export default async function VolunteerActivities({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireRole(["VOLUNTEER"]);
  const filters = await searchParams;
  const q = filters.q?.trim() ?? "";
  const type = ["PHYSICAL_VERIFICATION", "CALL_VERIFICATION", "TUTORING", "SCHOOL_VISIT", "SANTA_PROGRAMME", "OTHER"].includes(filters.type ?? "") ? filters.type : undefined;
  const status = ["PLANNED", "ASSIGNED", "IN_PROGRESS", "SUBMITTED", "COMPLETED", "FOLLOW_UP", "CANCELLED"].includes(filters.status ?? "") ? filters.status : undefined;
  const page = Math.max(1, Number.parseInt(filters.page ?? "1", 10) || 1);
  const where: Prisma.ActivityAssignmentWhereInput = {
    volunteerId: user.user.id,
    ...(status ? { status: status as VolunteerActivityStatus } : {}),
    activity: {
      ...(type ? { type: type as VolunteerActivityType } : {}),
      ...(q ? { OR: [{ name: { contains: q, mode: "insensitive" as const } }, { description: { contains: q, mode: "insensitive" as const } }] } : {}),
    },
  };
  const [assignments, total] = await Promise.all([
    prisma.activityAssignment.findMany({
      where,
      include: { activity: { include: { applicant: { select: { fullName: true } }, student: { include: { user: { select: { name: true } } } } } }, reports: { orderBy: { createdAt: "desc" }, take: 1 } },
      orderBy: [{ activity: { startsAt: "desc" } }, { assignedAt: "desc" }],
      take: 25,
      skip: (page - 1) * 25,
    }),
    prisma.activityAssignment.count({ where }),
  ]);

  return (
    <VolunteerShell name={user.user.name ?? "Volunteer"}>
      <PageHeader eyebrow="Assignments" title="My activities" description="Only activities assigned to your volunteer account are shown." />
      <form method="get" className="mb-5 grid gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-[1fr_200px_180px_auto] sm:items-end">
        <Field label="Search activities" name="q" placeholder="Name or description" defaultValue={q} />
        <Select label="Activity type" name="type" defaultValue={type ?? ""} placeholder="All types">
          <option value="PHYSICAL_VERIFICATION">Physical verification</option><option value="CALL_VERIFICATION">Call verification</option><option value="TUTORING">Tutoring</option><option value="SCHOOL_VISIT">School visit</option><option value="SANTA_PROGRAMME">Santa programme</option><option value="OTHER">Other</option>
        </Select>
        <Select label="Status" name="status" defaultValue={status ?? ""} placeholder="All statuses">
          <option value="ASSIGNED">Assigned</option><option value="IN_PROGRESS">In progress</option><option value="SUBMITTED">Submitted</option><option value="COMPLETED">Completed</option><option value="FOLLOW_UP">Follow-up</option><option value="CANCELLED">Cancelled</option>
        </Select>
        <Button type="submit" variant="secondary">Filter</Button>
      </form>

      <div className="space-y-3">
        {assignments.length ? assignments.map((assignment) => {
          const activity = assignment.activity;
          const student = activity.applicant?.fullName ?? activity.student?.user.name;
          const specializedHref = activity.type === "PHYSICAL_VERIFICATION" && activity.applicantId
            ? `/volunteer/physical-verifications/${activity.applicantId}?activityId=${activity.id}`
            : activity.type === "CALL_VERIFICATION" ? `/volunteer/call-verifications?activityId=${activity.id}`
              : activity.type === "TUTORING" ? `/volunteer/tutoring?activityId=${activity.id}`
                : `/volunteer/activities/${activity.id}`;
          return <Card key={assignment.id}>
            <CardHeader title={<Link href={specializedHref} className="hover:text-accent">{activity.name}</Link>} description={`${activity.type.replaceAll("_", " ")} · ${activity.location ?? "Location not set"}`} action={<StatusBadge value={assignment.status} />} />
            <CardBody>
              <p className="text-sm text-ink-muted">{activity.description}</p>
              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-4">
                <p><span className="text-ink-faint">Student </span>{student ?? "—"}</p>
                <p><span className="text-ink-faint">Starts </span>{activity.startsAt.toLocaleDateString()}</p>
                <p><span className="text-ink-faint">Due </span>{activity.dueAt?.toLocaleDateString() ?? "—"}</p>
                <p><span className="text-ink-faint">Priority </span>{activity.priority}</p>
              </div>
              <div className="mt-4 flex flex-wrap gap-2">
                <Link href={specializedHref} className="inline-flex items-center rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-surface-sunken">View details</Link>
                {["ASSIGNED", "PLANNED"].includes(assignment.status) && <form action={startVolunteerActivity}><input type="hidden" name="assignmentId" value={assignment.id} /><Button type="submit">Start activity</Button></form>}
                {(activity.type === "SCHOOL_VISIT" || activity.type === "SANTA_PROGRAMME" || activity.type === "OTHER") && assignment.status !== "COMPLETED" && <Link href={`/volunteer/activities/${activity.id}#report`} className="inline-flex items-center rounded-md bg-accent px-3 py-2 text-sm font-medium text-white">Submit report</Link>}
              </div>
              {assignment.reports[0] && <p className="mt-3 text-xs text-ink-faint">Latest report submitted {assignment.reports[0].createdAt.toLocaleString()} · {assignment.reports[0].reviewStatus.replaceAll("_", " ")}</p>}
            </CardBody>
          </Card>;
        }) : <Card><CardBody><p className="text-sm text-ink-muted">No activities match these filters.</p></CardBody></Card>}
      </div>
      <div className="mt-4 flex items-center justify-between text-sm"><p className="text-ink-faint">Showing {(page - 1) * 25 + (assignments.length ? 1 : 0)}–{(page - 1) * 25 + assignments.length} of {total}</p><div className="flex gap-3">{page > 1 && <a className="text-accent" href={`?q=${encodeURIComponent(q)}&type=${type ?? ""}&status=${status ?? ""}&page=${page - 1}`}>Previous</a>}{page * 25 < total && <a className="text-accent" href={`?q=${encodeURIComponent(q)}&type=${type ?? ""}&status=${status ?? ""}&page=${page + 1}`}>Next</a>}</div></div>
    </VolunteerShell>
  );
}
