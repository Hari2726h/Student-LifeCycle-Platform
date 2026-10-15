import Link from "next/link";
import { Users, AlertTriangle, Clock } from "lucide-react";
import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { Select } from "@/components/ui/input";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { logCheckIn } from "./actions";

const STALE_DAYS = 30;

export default async function MentorHome() {
  const session = await requireRole(["MENTOR"]);

  const mentor = await prisma.mentor.findUnique({
    where: { userId: session.user.id },
    include: {
      mentees: {
        include: {
          user: true,
          college: true,
          mentorLogs: { orderBy: { createdAt: "desc" }, take: 3 },
        },
      },
    },
  });

  const openRiskFlags =
    mentor?.mentees.flatMap((m) => m.mentorLogs.filter((l) => l.isRiskFlag && !l.resolvedAt).map((l) => ({ student: m, log: l }))) ?? [];

  const staleCutoff = new Date();
  staleCutoff.setDate(staleCutoff.getDate() - STALE_DAYS);
  const staleMentees =
    mentor?.mentees.filter((m) => {
      const lastCheckIn = m.mentorLogs[0]?.createdAt;
      return !lastCheckIn || lastCheckIn < staleCutoff;
    }) ?? [];

  return (
    <AppShell
      role="MENTOR"
      name={session.user.name ?? "Mentor"}
      nav={[{ label: "My mentees", href: "/mentor", icon: <Users /> }]}
    >
      <PageHeader
        eyebrow="Mentorship"
        title="My mentees"
        description={mentor ? `${mentor.mentees.length} of ${mentor.maxLoad} capacity · ${mentor.specialty ?? ""}` : undefined}
      />

      {openRiskFlags.length > 0 && (
        <Card className="mb-4 border-danger/30 bg-danger-soft/50">
          <CardBody className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-medium text-danger">
                {openRiskFlags.length} open risk {openRiskFlags.length === 1 ? "flag" : "flags"}
              </p>
              <ul className="mt-1.5 space-y-1 text-sm text-ink">
                {openRiskFlags.map(({ student, log }) => (
                  <li key={log.id}>
                    <span className="font-medium">{student.user.name}</span>
                    <span className="text-ink-muted"> — {log.category.toLowerCase()}: {log.note}</span>
                  </li>
                ))}
              </ul>
            </div>
          </CardBody>
        </Card>
      )}

      {staleMentees.length > 0 && (
        <Card className="mb-6 border-warning/30 bg-warning-soft/50">
          <CardBody className="flex items-start gap-3">
            <Clock className="mt-0.5 size-4 shrink-0 text-warning" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-medium text-warning">
                {staleMentees.length} {staleMentees.length === 1 ? "mentee hasn't" : "mentees haven't"} been checked on in {STALE_DAYS}+ days
              </p>
              <p className="mt-0.5 text-sm text-ink-muted">
                {staleMentees.map((m) => m.user.name).join(", ")}
              </p>
            </div>
          </CardBody>
        </Card>
      )}

      {!mentor || mentor.mentees.length === 0 ? (
        <EmptyState icon={Users} title="No mentees assigned yet" />
      ) : (
        <div className="space-y-4">
          {mentor.mentees.map((m) => (
            <Card key={m.id}>
              <CardBody>
                <div className="flex items-start justify-between gap-3">
                  <Link href={`/mentor/students/${m.id}`} className="flex min-w-0 items-center gap-3 hover:opacity-80">
                    <Avatar name={m.user.name} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-accent">{m.user.name}</p>
                      <p className="truncate text-xs text-ink-faint">
                        {m.program} · {m.college.name}
                      </p>
                    </div>
                  </Link>
                  <StatusBadge value={m.status} />
                </div>

                {m.mentorLogs.length > 0 && (
                  <ul className="mt-3.5 space-y-1.5 border-t border-border pt-3.5">
                    {m.mentorLogs.map((log) => (
                      <li key={log.id} className="flex items-start gap-2 text-xs text-ink-muted">
                        {log.isRiskFlag && <Badge tone={log.severity === "HIGH" ? "danger" : "warning"}>{log.severity}</Badge>}
                        <span>{log.note}</span>
                      </li>
                    ))}
                  </ul>
                )}

                <form action={logCheckIn} className="mt-3.5 space-y-2 border-t border-border pt-3.5">
                  <input type="hidden" name="studentId" value={m.id} />
                  <input type="hidden" name="mentorId" value={mentor.id} />
                  <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                    <Select label="Category" name="category" defaultValue="OTHER" className="text-xs">
                      <option value="ACADEMIC">Academic</option>
                      <option value="ATTENDANCE">Attendance</option>
                      <option value="FINANCIAL">Financial</option>
                      <option value="PERSONAL">Personal</option>
                      <option value="OTHER">General</option>
                    </Select>
                    <Select label="Severity" name="severity" defaultValue="LOW" className="text-xs">
                      <option value="LOW">Low</option>
                      <option value="MEDIUM">Medium</option>
                      <option value="HIGH">High</option>
                    </Select>
                    <label className="col-span-2 flex items-end gap-1.5 pb-2 text-xs text-ink sm:col-span-1">
                      <input type="checkbox" name="isRiskFlag" value="true" className="size-4 rounded border-border accent-danger" />
                      Flag as risk
                    </label>
                  </div>
                  <div className="flex gap-2">
                    <input
                      name="note"
                      required
                      placeholder="Add a check-in note…"
                      className="flex-1 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-faint focus-visible:outline-2 focus-visible:outline-accent"
                    />
                    <Button type="submit" variant="primary" size="sm">
                      Log
                    </Button>
                  </div>
                </form>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}
