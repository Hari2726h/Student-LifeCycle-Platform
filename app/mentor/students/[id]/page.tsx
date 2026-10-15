import { notFound, redirect } from "next/navigation";
import { Users, Award } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { TrendLine } from "@/components/ui/trend-line";
import { logCheckIn } from "@/app/mentor/actions";
import { addCertification, addAcademicRecord } from "./actions";

export default async function MenteeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user || session.user.role !== "MENTOR") redirect("/login");
  const { id } = await params;

  const mentor = await prisma.mentor.findUniqueOrThrow({ where: { userId: session.user.id } });
  const student = await prisma.student.findUnique({
    where: { id },
    include: {
      user: true,
      college: true,
      mentorLogs: { orderBy: { createdAt: "desc" } },
      academicRecords: { orderBy: { semester: "asc" } },
      certifications: { include: { courseCatalog: true } },
    },
  });
  if (!student) notFound();
  if (student.mentorId !== mentor.id) redirect("/mentor?error=Not+your+mentee");

  const catalog = await prisma.courseCatalog.findMany({ orderBy: { name: "asc" } });

  return (
    <AppShell role="MENTOR" name={session.user.name ?? "Mentor"} nav={[{ label: "My mentees", href: "/mentor", icon: <Users /> }]}>
      <PageHeader
        eyebrow="Mentee"
        title={student.user.name}
        description={`${student.program} · ${student.college.name}`}
        action={<StatusBadge value={student.status} />}
      />

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader eyebrow="Mentorship" title="Log a check-in" />
            <CardBody>
              <form action={logCheckIn} className="space-y-3">
                <input type="hidden" name="studentId" value={student.id} />
                <input type="hidden" name="mentorId" value={mentor.id} />
                <div className="grid grid-cols-2 gap-3">
                  <Select label="Category" name="category" defaultValue="OTHER">
                    <option value="ACADEMIC">Academic</option>
                    <option value="ATTENDANCE">Attendance</option>
                    <option value="FINANCIAL">Financial</option>
                    <option value="PERSONAL">Personal</option>
                    <option value="OTHER">General</option>
                  </Select>
                  <Select label="Severity" name="severity" defaultValue="LOW">
                    <option value="LOW">Low</option>
                    <option value="MEDIUM">Medium</option>
                    <option value="HIGH">High</option>
                  </Select>
                </div>
                <label className="flex items-center gap-2 text-sm text-ink">
                  <input type="checkbox" name="isRiskFlag" value="true" className="size-4 rounded border-border accent-danger" />
                  Flag as risk — notifies program staff immediately
                </label>
                <Field label="Note" name="note" required placeholder="What did you observe?" />
                <Button type="submit" variant="primary" className="w-full">
                  Log check-in
                </Button>
              </form>
            </CardBody>
          </Card>

          <Card>
            <CardHeader eyebrow="History" title="All check-ins" />
            <CardBody>
              {student.mentorLogs.length === 0 ? (
                <p className="text-sm text-ink-faint">No check-ins logged yet.</p>
              ) : (
                <ul className="space-y-2.5">
                  {student.mentorLogs.map((log) => (
                    <li key={log.id} className="flex items-start gap-2 text-sm">
                      {log.isRiskFlag && <Badge tone={log.resolvedAt ? "neutral" : "danger"}>{log.severity}</Badge>}
                      <div>
                        <span className="text-ink">{log.note}</span>
                        <span className="ml-1.5 text-xs text-ink-faint">
                          · {log.category.toLowerCase()} · {log.createdAt.toLocaleDateString()}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader eyebrow="Progress" title="Academic trend" description="Each new semester plots here — a decline is visible before it's a crisis." />
            <CardBody>
              <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
                <TrendLine
                  title="GPA"
                  points={student.academicRecords.map((r) => ({ label: `S${r.semester}`, value: r.gpa }))}
                  format={(v) => v.toFixed(2)}
                />
                <TrendLine
                  title="Attendance"
                  points={student.academicRecords.map((r) => ({ label: `S${r.semester}`, value: r.attendancePercent }))}
                  format={(v) => `${v.toFixed(0)}%`}
                />
              </div>

              <form action={addAcademicRecord.bind(null, student.id)} className="mt-5 grid grid-cols-3 gap-2 border-t border-border pt-4">
                <Field label="Semester" type="number" name="semester" min={1} max={12} required />
                <Field label="GPA" type="number" step="0.01" name="gpa" min={0} max={10} required />
                <Field label="Attendance %" type="number" step="0.1" name="attendancePercent" min={0} max={100} required />
                <Button type="submit" variant="secondary" size="sm" className="col-span-3">
                  Add academic record
                </Button>
              </form>
            </CardBody>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader eyebrow="Progress" title="Certifications" action={<Award className="size-4 text-ink-faint" aria-hidden />} />
            <CardBody className="space-y-4">
              {student.certifications.length === 0 ? (
                <p className="text-sm text-ink-faint">None recorded yet.</p>
              ) : (
                <ul className="divide-y divide-border">
                  {student.certifications.map((c) => (
                    <li key={c.id} className="flex items-center justify-between py-2 text-sm first:pt-0">
                      <span className="text-ink">{c.name}</span>
                      <StatusBadge value={c.status} />
                    </li>
                  ))}
                </ul>
              )}

              <form action={addCertification.bind(null, student.id)} className="space-y-3 border-t border-border pt-4">
                <Select label="From catalog (optional)" name="courseCatalogId" placeholder="Custom entry">
                  {catalog.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
                <Field label="Name" name="name" required placeholder="Certification name" />
                <Field label="Issuer (optional)" name="issuer" />
                <Select label="Status" name="status" defaultValue="IN_PROGRESS">
                  <option value="IN_PROGRESS">In progress</option>
                  <option value="COMPLETED">Completed</option>
                  <option value="LAPSED">Lapsed</option>
                </Select>
                <Button type="submit" variant="secondary" size="sm" className="w-full">
                  Add certification
                </Button>
              </form>
            </CardBody>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
