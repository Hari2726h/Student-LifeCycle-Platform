import Link from "next/link";
import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { VolunteerShell } from "@/components/volunteer-shell";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";

export default async function SantaProgrammePage() {
  const session = await requireRole(["VOLUNTEER"]);
  const assignments = await prisma.activityAssignment.findMany({
    where: { volunteerId: session.user.id, activity: { type: "SANTA_PROGRAMME" } },
    include: { activity: { include: { _count: { select: { assignments: true, santaBeneficiaries: true } } } } },
    orderBy: { activity: { startsAt: "asc" } },
  });
  return (
    <VolunteerShell name={session.user.name ?? "Volunteer"}>
      <PageHeader eyebrow="Community programme" title="Santa Claus programme" description="Review your event assignment, role and responsibilities. Child beneficiary details are restricted to authorized staff." />
      <div className="space-y-4">
        {assignments.length ? assignments.map((assignment) => <Card key={assignment.id}>
          <CardHeader title={assignment.activity.name} description={assignment.activity.description} action={<StatusBadge value={assignment.activity.status} />} />
          <CardBody>
            <div className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3"><Info label="Programme name" value={assignment.activity.name} /><Info label="Event date" value={assignment.activity.startsAt.toLocaleString()} /><Info label="Location / venue" value={assignment.activity.location ?? "Not set"} /><Info label="Reporting time" value={(assignment.activity.reportingAt ?? assignment.activity.startsAt).toLocaleTimeString()} /><Info label="Programme status" value={assignment.activity.status === "COMPLETED" ? "Completed" : assignment.activity.status === "IN_PROGRESS" || assignment.activity.status === "SUBMITTED" ? "Ongoing" : "Upcoming"} /><Info label="Your assignment status" value={assignment.status.replaceAll("_", " ")} /></div>
            <div className="mt-4 rounded-md bg-surface-sunken p-3 text-sm"><p><span className="text-ink-faint">Assigned role / task: </span>{assignment.responsibility ?? "Event support"}</p><p className="mt-1"><span className="text-ink-faint">Total volunteers: </span>{assignment.activity._count.assignments}</p><p className="mt-1"><span className="text-ink-faint">Total children: </span>{assignment.activity._count.santaBeneficiaries} · beneficiary names and gift records are restricted to programme staff.</p></div>
            <div className="mt-4 flex flex-wrap gap-3"><Link className="rounded-md bg-accent px-3 py-2 text-sm font-medium text-white" href={`/volunteer/activities/${assignment.activityId}#report`}>Submit event report</Link><Link className="rounded-md border border-border px-3 py-2 text-sm" href={`/volunteer/activities/${assignment.activityId}`}>View activity details</Link></div>
          </CardBody>
        </Card>) : <Card><CardBody><p className="text-sm text-ink-muted">No Santa Claus programme assignments yet.</p></CardBody></Card>}
      </div>
    </VolunteerShell>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs text-ink-faint">{label}</p><p className="mt-1 break-all">{value}</p></div>;
}
