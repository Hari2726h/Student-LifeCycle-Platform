import { revalidatePath } from "next/cache";
import { Users, AlertTriangle } from "lucide-react";
import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";

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
        <Card className="mb-6 border-danger/30 bg-danger-soft/50">
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

      {!mentor || mentor.mentees.length === 0 ? (
        <EmptyState icon={Users} title="No mentees assigned yet" />
      ) : (
        <div className="space-y-4">
          {mentor.mentees.map((m) => (
            <Card key={m.id}>
              <CardBody>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <Avatar name={m.user.name} />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink">{m.user.name}</p>
                      <p className="truncate text-xs text-ink-faint">
                        {m.program} · {m.college.name}
                      </p>
                    </div>
                  </div>
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

                <form action={addCheckIn} className="mt-3.5 flex gap-2 border-t border-border pt-3.5">
                  <input type="hidden" name="studentId" value={m.id} />
                  <input type="hidden" name="mentorId" value={mentor.id} />
                  <input
                    name="note"
                    placeholder="Add a check-in note…"
                    className="flex-1 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-ink placeholder:text-ink-faint focus-visible:outline-2 focus-visible:outline-accent"
                  />
                  <Button type="submit" variant="primary" size="sm">
                    Log
                  </Button>
                </form>
              </CardBody>
            </Card>
          ))}
        </div>
      )}
    </AppShell>
  );
}

async function addCheckIn(formData: FormData) {
  "use server";
  const studentId = String(formData.get("studentId"));
  const mentorId = String(formData.get("mentorId"));
  const note = String(formData.get("note") ?? "").trim();
  if (!note) return;

  await prisma.mentorLog.create({
    data: {
      studentId,
      mentorId,
      category: "OTHER",
      severity: "LOW",
      note,
      isRiskFlag: false,
    },
  });

  revalidatePath("/mentor");
}
