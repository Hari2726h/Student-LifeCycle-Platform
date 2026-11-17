import Link from "next/link";
import { CalendarClock, CheckCircle2, Clock3, GraduationCap, HandHeart, ListTodo } from "lucide-react";
import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { VolunteerShell } from "@/components/volunteer-shell";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge, StatusBadge } from "@/components/ui/badge";

export default async function VolunteerDashboard() {
  const session = await requireRole(["VOLUNTEER"]);
  const [assignments, sessions, followUps, expenses] = await Promise.all([
    prisma.activityAssignment.findMany({
      where: { volunteerId: session.user.id },
      include: {
        activity: { include: { applicant: true, student: { include: { user: true } } } },
        reports: { select: { hours: true, reviewStatus: true } },
        tutoringSessions: { select: { durationHours: true } },
      },
      orderBy: [{ activity: { startsAt: "asc" } }],
      take: 500,
    }),
    prisma.tutoringSession.findMany({ where: { volunteerId: session.user.id }, select: { durationHours: true, studentId: true } }),
    prisma.callVerification.count({ where: { volunteerId: session.user.id, followUpRequired: true, nextFollowUpAt: { gte: new Date() } } }),
    prisma.activityExpense.aggregate({ where: { volunteerId: session.user.id, status: "APPROVED" }, _sum: { amount: true } }),
  ]);
  const counts = {
    total: assignments.length,
    pending: assignments.filter((a) => ["ASSIGNED", "PLANNED"].includes(a.status)).length,
    inProgress: assignments.filter((a) => a.status === "IN_PROGRESS").length,
    completed: assignments.filter((a) => a.status === "COMPLETED").length,
    hours: assignments.reduce((total, a) => total + a.reports.reduce((sum, report) => sum + report.hours, 0) + a.tutoringSessions.reduce((sum, item) => sum + item.durationHours, 0), 0) + sessions.filter((item) => !item.studentId).reduce((sum, item) => sum + item.durationHours, 0),
    supported: new Set([
      ...assignments.map((a) => a.activity.applicantId).filter((id): id is string => Boolean(id)),
      ...sessions.map((s) => s.studentId).filter((id): id is string => Boolean(id)),
    ]).size,
  };
  const upcoming = assignments.filter((a) => a.activity.startsAt >= new Date() && !["COMPLETED", "CANCELLED"].includes(a.status)).slice(0, 5);
  const recent = [...assignments].sort((a, b) => b.assignedAt.getTime() - a.assignedAt.getTime()).slice(0, 5);
  const activityTotals = new Map<string, { type: string; count: number; hours: number }>();
  for (const assignment of assignments) {
    const current = activityTotals.get(assignment.activity.type) ?? { type: assignment.activity.type, count: 0, hours: 0 };
    current.count += 1;
    current.hours += assignment.reports.reduce((sum, report) => sum + report.hours, 0) + assignment.tutoringSessions.reduce((sum, item) => sum + item.durationHours, 0);
    activityTotals.set(assignment.activity.type, current);
  }
  const cards = [
    { label: "Assigned activities", value: counts.total, icon: HandHeart },
    { label: "Pending", value: counts.pending, icon: ListTodo },
    { label: "In progress", value: counts.inProgress, icon: Clock3 },
    { label: "Completed", value: counts.completed, icon: CheckCircle2 },
    { label: "Students supported", value: counts.supported, icon: GraduationCap },
    { label: "Volunteer hours", value: counts.hours.toFixed(1), icon: CalendarClock },
  ];

  return (
    <VolunteerShell name={session.user.name ?? "Volunteer"}>
      <PageHeader eyebrow="Volunteer portal" title="Your volunteering" description="Assignments, visits, sessions and contribution at a glance." />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map(({ label, value, icon: Icon }) => (
          <Card key={label}><CardBody className="flex items-center justify-between gap-3">
            <div><p className="text-sm text-ink-muted">{label}</p><p className="mt-1 font-display text-2xl text-ink">{value}</p></div>
            <Icon className="size-5 text-accent" aria-hidden />
          </CardBody></Card>
        ))}
      </div>

      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader title="Upcoming assignments" description="Your next scheduled activities" action={<Link className="text-sm text-accent" href="/volunteer/activities">View all</Link>} />
          <CardBody className="space-y-3">
            {upcoming.length ? upcoming.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0">
              <div><Link href={`/volunteer/activities/${item.activityId}`} className="font-medium text-ink hover:text-accent">{item.activity.name}</Link><p className="text-sm text-ink-muted">{item.activity.type.replaceAll("_", " ")} · {item.activity.startsAt.toLocaleDateString()}</p></div>
              <StatusBadge value={item.status} />
            </div>) : <p className="text-sm text-ink-muted">No upcoming assignments.</p>}
          </CardBody>
        </Card>
        <Card>
          <CardHeader title="Contribution by activity" description="Assignments and reported hours" />
          <CardBody className="space-y-3">
            {activityTotals.size ? [...activityTotals.values()].map((item) => <div key={item.type} className="flex items-center justify-between gap-2 text-sm">
              <span className="text-ink">{item.type.replaceAll("_", " ")}</span><span className="text-ink-muted">{item.count} · {item.hours.toFixed(1)} h</span>
            </div>) : <p className="text-sm text-ink-muted">Your contributions will appear here as you complete activities.</p>}
            <p className="border-t border-border pt-3 text-xs text-ink-faint">Approved expenses: ₹{Number(expenses._sum.amount ?? 0).toLocaleString("en-IN")} · Follow-ups due: {followUps}</p>
          </CardBody>
        </Card>
      </div>

      <Card className="mt-4">
        <CardHeader title="Recent activity" description="Latest assignments and their status" />
        <CardBody className="space-y-3">
          {recent.length ? recent.map((item) => <div key={item.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3 last:border-0 last:pb-0">
            <div><p className="font-medium text-ink">{item.activity.name}</p><p className="text-sm text-ink-muted">{item.activity.location ?? "Location not set"} · assigned {item.assignedAt.toLocaleDateString()}</p></div>
            <Badge tone={item.status === "COMPLETED" ? "success" : item.status === "FOLLOW_UP" ? "warning" : "neutral"}>{item.status.replaceAll("_", " ")}</Badge>
          </div>) : <p className="text-sm text-ink-muted">You have no assigned activities yet.</p>}
        </CardBody>
      </Card>
    </VolunteerShell>
  );
}
