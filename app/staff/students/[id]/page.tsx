import { notFound, redirect } from "next/navigation";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { getStaffNav } from "@/lib/staff-nav";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Select, Field } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { createFollowUp, resolveFollowUp, resolveRiskFlag } from "./actions";

export default async function StaffStudentDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || session.user.role !== "STAFF") redirect("/login");
  const { id } = await params;

  const student = await prisma.student.findUnique({
    where: { id },
    include: {
      user: true,
      college: true,
      mentor: { include: { user: true } },
      mentorLogs: { orderBy: { createdAt: "desc" }, take: 10, include: { resolvedBy: true } },
      academicRecords: { orderBy: { semester: "desc" } },
      certifications: true,
      followUps: { orderBy: { createdAt: "desc" }, include: { assignedTo: true } },
    },
  });
  if (!student) notFound();

  const staffUsers = await prisma.user.findMany({ where: { role: "STAFF", isActive: true } });
  const openRiskFlags = student.mentorLogs.filter((l) => l.isRiskFlag && !l.resolvedAt);
  const nav = await getStaffNav("STAFF", session.user.id);

  return (
    <AppShell role="STAFF" name={session.user.name ?? "Staff"} nav={nav}>
      <PageHeader
        eyebrow="Student"
        title={student.user.name}
        description={`${student.program} · ${student.college.name} · mentor ${student.mentor?.user.name ?? "unassigned"}`}
        action={<StatusBadge value={student.status} />}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {openRiskFlags.length > 0 && (
            <Card className="border-danger/30 bg-danger-soft/40">
              <CardHeader eyebrow="Needs attention" title={`Open risk flags (${openRiskFlags.length})`} />
              <CardBody className="space-y-3">
                {openRiskFlags.map((log) => (
                  <div key={log.id} className="flex items-start justify-between gap-3 text-sm">
                    <div className="flex items-start gap-2">
                      <AlertTriangle className="mt-0.5 size-4 shrink-0 text-danger" aria-hidden />
                      <div>
                        <Badge tone={log.severity === "HIGH" ? "danger" : "warning"}>{log.category} · {log.severity}</Badge>
                        <p className="mt-1 text-ink">{log.note}</p>
                        <p className="text-xs text-ink-faint">{log.createdAt.toLocaleString()}</p>
                      </div>
                    </div>
                    <form action={resolveRiskFlag.bind(null, log.id, student.id)}>
                      <Button type="submit" variant="secondary" size="sm">
                        Resolve
                      </Button>
                    </form>
                  </div>
                ))}
              </CardBody>
            </Card>
          )}

          <Card>
            <CardHeader eyebrow="Mentorship" title="Check-in history" />
            <CardBody>
              {student.mentorLogs.length === 0 ? (
                <p className="text-sm text-ink-faint">No check-ins logged yet.</p>
              ) : (
                <ul className="space-y-2.5">
                  {student.mentorLogs.map((log) => (
                    <li key={log.id} className="flex items-start gap-2 text-sm">
                      {log.isRiskFlag && <Badge tone={log.resolvedAt ? "neutral" : "danger"}>{log.severity}</Badge>}
                      <div className="min-w-0">
                        <span className="text-ink">{log.note}</span>
                        <span className="ml-1.5 text-xs text-ink-faint">· {log.createdAt.toLocaleDateString()}</span>
                        {log.resolvedAt && (
                          <span className="ml-1.5 text-xs text-success">· resolved by {log.resolvedBy?.name}</span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader eyebrow="Progress" title="Academic record" />
            <CardBody>
              {student.academicRecords.length === 0 ? (
                <p className="text-sm text-ink-faint">None recorded yet.</p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase text-ink-faint">
                      <th className="pb-1.5">Semester</th>
                      <th className="pb-1.5 text-right">GPA</th>
                      <th className="pb-1.5 text-right">Attendance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {student.academicRecords.map((r) => (
                      <tr key={r.id} className="border-t border-border">
                        <td className="py-1.5">{r.semester}</td>
                        <td className="py-1.5 text-right font-mono tabular-nums">{r.gpa.toFixed(2)}</td>
                        <td className="py-1.5 text-right font-mono tabular-nums">{r.attendancePercent.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader eyebrow="Progress" title="Certifications" />
            <CardBody>
              {student.certifications.length === 0 ? (
                <p className="text-sm text-ink-faint">None recorded yet.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {student.certifications.map((c) => (
                    <li key={c.id} className="flex items-center justify-between py-2 text-sm first:pt-0 last:pb-0">
                      <span className="text-ink">{c.name}</span>
                      <StatusBadge value={c.status} />
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader eyebrow="Worklist" title="Follow-ups" />
            <CardBody className="space-y-4">
              <form action={createFollowUp} className="space-y-3 border-b border-border pb-4">
                <input type="hidden" name="studentId" value={student.id} />
                <Select label="Assign to" name="assignedToId" required placeholder="Select staff" defaultValue={session.user.id}>
                  {staffUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </Select>
                <Field label="Note" name="note" required placeholder="What needs to happen?" />
                <Button type="submit" variant="primary" size="sm" className="w-full">
                  Assign follow-up
                </Button>
              </form>

              {student.followUps.length === 0 ? (
                <p className="text-sm text-ink-faint">No follow-ups yet.</p>
              ) : (
                <ul className="space-y-3">
                  {student.followUps.map((f) => (
                    <li key={f.id} className="text-sm">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className={f.status === "DONE" ? "text-ink-faint line-through" : "text-ink"}>{f.note}</p>
                          <p className="text-xs text-ink-faint">
                            {f.assignedTo.name} · {f.createdAt.toLocaleDateString()}
                          </p>
                        </div>
                        {f.status === "OPEN" ? (
                          <form action={resolveFollowUp.bind(null, f.id, student.id)}>
                            <Button type="submit" variant="ghost" size="sm">
                              <CheckCircle2 className="size-4" aria-hidden />
                            </Button>
                          </form>
                        ) : (
                          <Badge tone="success">Done</Badge>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
