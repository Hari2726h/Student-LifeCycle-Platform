import { GraduationCap, Heart, Check, Briefcase } from "lucide-react";
import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Field } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, Thead, Th, Tr, Td, TableScroll } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { selfReportCareerEvent } from "./actions";

const SOURCE_TONE: Record<string, "accent" | "info" | "gold"> = {
  SELF_REPORTED: "accent",
  REFERRAL: "info",
  PLACEMENT: "gold",
};
const SOURCE_LABEL: Record<string, string> = {
  SELF_REPORTED: "Self-reported",
  REFERRAL: "Referral",
  PLACEMENT: "Placement",
};

export default async function PortalHome() {
  const session = await requireRole(["STUDENT", "ALUMNI"]);

  const student = await prisma.student.findUnique({
    where: { userId: session.user.id },
    include: {
      college: true,
      mentor: { include: { user: true } },
      sponsorship: true,
      certifications: { include: { courseCatalog: true } },
      academicRecords: { orderBy: { semester: "desc" } },
      placement: true,
      alumniProfile: { include: { karpomSessions: true, careerEvents: { orderBy: { startDate: "desc" } } } },
    },
  });

  return (
    <AppShell
      role={session.user.role}
      name={session.user.name ?? "Student"}
      nav={[{ label: "Overview", href: "/portal", icon: <GraduationCap /> }]}
    >
      <PageHeader
        eyebrow={session.user.role === "ALUMNI" ? "Alumni" : "Student"}
        title={student?.program ?? "Your record"}
        description={student ? `${student.college.name} · Admitted ${student.admissionYear}` : undefined}
        action={student ? <StatusBadge value={student.status} /> : undefined}
      />

      {!student ? (
        <EmptyState icon={GraduationCap} title="No student record found" />
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          <div className="space-y-5 lg:col-span-2">
            <Card>
              <CardHeader eyebrow="Mentorship" title={student.mentor?.user.name ?? "No mentor assigned"} description={student.mentor?.specialty} />
            </Card>

            <Card>
              <CardHeader eyebrow="Progress" title="Certifications" />
              <CardBody>
                {student.certifications.length === 0 ? (
                  <p className="text-sm text-ink-faint">None recorded yet.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {student.certifications.map((c) => (
                      <li key={c.id} className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0">
                        <div className="min-w-0">
                          <p className="truncate text-sm text-ink">{c.name}</p>
                          {c.issuer && <p className="text-xs text-ink-faint">{c.issuer}</p>}
                        </div>
                        <StatusBadge value={c.status} />
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>

            <Card>
              <CardHeader eyebrow="Progress" title="Academic record" />
              {student.academicRecords.length === 0 ? (
                <CardBody>
                  <p className="text-sm text-ink-faint">None recorded yet.</p>
                </CardBody>
              ) : (
                <div className="p-5 pt-0">
                  <TableScroll>
                    <Table>
                      <Thead>
                        <tr>
                          <Th>Semester</Th>
                          <Th className="text-right">GPA</Th>
                          <Th className="text-right">Attendance</Th>
                        </tr>
                      </Thead>
                      <tbody>
                        {student.academicRecords.map((r) => (
                          <Tr key={r.id}>
                            <Td>{r.semester}</Td>
                            <Td className="text-right font-mono tabular-nums">{r.gpa.toFixed(2)}</Td>
                            <Td className="text-right font-mono tabular-nums">{r.attendancePercent.toFixed(1)}%</Td>
                          </Tr>
                        ))}
                      </tbody>
                    </Table>
                  </TableScroll>
                </div>
              )}
            </Card>
          </div>

          <div className="space-y-5">
            {student.sponsorship && (
              <Card>
                <CardHeader eyebrow="Coverage" title="Sponsorship" />
                <CardBody>
                  <ul className="space-y-2 text-sm">
                    {[
                      ["Tuition", student.sponsorship.tuitionCovered],
                      ["Hostel", student.sponsorship.hostelCovered],
                      ["Food", student.sponsorship.foodCovered],
                      ["Transport", student.sponsorship.transportCovered],
                      ["Materials", student.sponsorship.materialsCovered],
                    ].map(([label, covered]) => (
                      <li key={label as string} className="flex items-center gap-2 text-ink">
                        <span
                          className={`flex size-4 items-center justify-center rounded-full ${
                            covered ? "bg-success-soft text-success" : "bg-surface-sunken text-ink-faint"
                          }`}
                        >
                          {covered && <Check className="size-2.5" strokeWidth={3} aria-hidden />}
                        </span>
                        {label as string}
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            )}

            {student.placement && (
              <Card>
                <CardHeader eyebrow="Outcome" title="Placement" />
                <CardBody>
                  <p className="text-sm text-ink">
                    {student.placement.role} at <span className="font-medium">{student.placement.company}</span>
                  </p>
                  {student.placement.packageInrLakhs && (
                    <p className="mt-0.5 font-mono text-sm tabular-nums text-ink-muted">
                      ₹{student.placement.packageInrLakhs}L
                    </p>
                  )}
                </CardBody>
              </Card>
            )}

            {student.alumniProfile && (
              <Card>
                <CardHeader
                  eyebrow="Current"
                  title={student.alumniProfile.currentCompany ? `${student.alumniProfile.currentRole} at ${student.alumniProfile.currentCompany}` : "No current position on record"}
                  description="Derived by replaying your career history below — not stored directly."
                  action={<Briefcase className="size-4 text-ink-faint" aria-hidden />}
                />
                <CardBody className="space-y-4">
                  {session.user.role === "ALUMNI" && (
                    <form action={selfReportCareerEvent} className="grid grid-cols-1 gap-2 border-b border-border pb-4 sm:grid-cols-4">
                      <Field label="Company" name="company" required className="sm:col-span-2" />
                      <Field label="Role" name="role" required />
                      <Field label="Start date" type="date" name="startDate" required />
                      <Button type="submit" variant="secondary" size="sm" className="sm:col-span-4">
                        Add career update
                      </Button>
                    </form>
                  )}

                  {student.alumniProfile.careerEvents.length === 0 ? (
                    <p className="text-sm text-ink-faint">No career history yet.</p>
                  ) : (
                    <ul className="space-y-2.5">
                      {student.alumniProfile.careerEvents.map((e) => (
                        <li key={e.id} className="flex items-start justify-between gap-3 text-sm">
                          <div>
                            <p className="text-ink">
                              {e.role} <span className="text-ink-muted">at {e.company}</span>
                            </p>
                            <p className="text-xs text-ink-faint">
                              {e.startDate.toLocaleDateString()} – {e.endDate ? e.endDate.toLocaleDateString() : "present"}
                            </p>
                          </div>
                          <Badge tone={SOURCE_TONE[e.source]}>{SOURCE_LABEL[e.source]}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardBody>
              </Card>
            )}

            {student.alumniProfile && (
              <Card className="border-gold/30 bg-gold-soft/40">
                <CardHeader
                  eyebrow="Giving back"
                  title="Karpom Karpippom"
                  description={`Mentoring opt-in: ${student.alumniProfile.mentoringOptIn ? "Yes" : "No"}`}
                  action={<Heart className="size-4 text-gold" aria-hidden />}
                />
                <CardBody>
                  {student.alumniProfile.karpomSessions.length === 0 ? (
                    <p className="text-sm text-ink-faint">No tutoring sessions logged yet.</p>
                  ) : (
                    <ul className="space-y-2">
                      {student.alumniProfile.karpomSessions.map((s) => (
                        <li key={s.id} className="text-sm text-ink">
                          <span className="font-medium">{s.subject}</span>
                          <span className="text-ink-faint"> — {s.juniorName}</span>
                          <span className="block font-mono text-xs text-ink-faint">
                            {s.sessionDate.toLocaleDateString()}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardBody>
              </Card>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
