import { ListChecks, AlertTriangle } from "lucide-react";
import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { StatStrip } from "@/components/ui/stat-strip";
import { Table, Thead, Th, Tr, Td, TableScroll } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";

const APPLICANT_STAGE_ORDER = [
  "SUBMITTED",
  "UNDER_VERIFICATION",
  "VERIFIED",
  "INTERVIEW_SCHEDULED",
  "INTERVIEWED",
  "ACCEPTED",
  "WAITLISTED",
  "REJECTED",
  "WITHDRAWN",
] as const;

const STUDENT_STAGE_ORDER = ["ONBOARDING", "ACTIVE", "PLACED", "ALUMNI", "WITHDRAWN", "DROPPED_OUT"] as const;

export default async function StaffHome() {
  const session = await requireRole(["STAFF", "COMMITTEE", "VOLUNTEER"]);
  const role = session.user.role;

  const [applicantCounts, studentCounts] = await Promise.all([
    prisma.applicant.groupBy({ by: ["status"], _count: true }),
    prisma.student.groupBy({ by: ["status"], _count: true }),
  ]);
  const applicantCountMap = Object.fromEntries(applicantCounts.map((c) => [c.status, c._count]));
  const studentCountMap = Object.fromEntries(studentCounts.map((c) => [c.status, c._count]));

  const volunteerQueue =
    role === "VOLUNTEER"
      ? await prisma.applicant.findMany({
          where: { volunteerId: session.user.id, status: { in: ["UNDER_VERIFICATION", "SUBMITTED"] } },
          orderBy: { createdAt: "asc" },
        })
      : [];

  const interviewQueue =
    role === "COMMITTEE"
      ? await prisma.applicant.findMany({
          where: { status: { in: ["INTERVIEW_SCHEDULED", "INTERVIEWED"] } },
          include: { interview: { include: { scores: true } } },
          orderBy: { createdAt: "asc" },
        })
      : [];

  const fullPipeline =
    role === "STAFF"
      ? await prisma.applicant.findMany({
          orderBy: { createdAt: "desc" },
          include: { volunteer: true },
          take: 25,
        })
      : [];

  const atRiskStudents =
    role === "STAFF"
      ? await prisma.student.findMany({
          where: { mentorLogs: { some: { isRiskFlag: true, resolvedAt: null } } },
          include: { user: true, mentor: { include: { user: true } }, mentorLogs: { where: { isRiskFlag: true, resolvedAt: null } } },
        })
      : [];

  return (
    <AppShell role={role} name={session.user.name ?? "Staff"} nav={[{ label: "Pipeline", href: "/staff", icon: <ListChecks /> }]}>
      <PageHeader
        eyebrow="Operations"
        title="Pipeline"
        description="Every applicant and student, from first submission to alumni."
      />

      <div className="space-y-2.5">
        <StatStrip items={APPLICANT_STAGE_ORDER.map((s) => ({ label: s.replaceAll("_", " "), value: applicantCountMap[s] ?? 0 }))} />
        <StatStrip
          emphasis="muted"
          items={STUDENT_STAGE_ORDER.map((s) => ({ label: `Students · ${s.replaceAll("_", " ")}`, value: studentCountMap[s] ?? 0 }))}
        />
      </div>

      {role === "VOLUNTEER" && (
        <section className="mt-8">
          <Card>
            <CardHeader eyebrow="My queue" title="Verification queue" />
            <PipelineTable
              rows={volunteerQueue}
              empty="No applicants assigned to you right now."
              columns={["Name", "District", "Status"]}
              render={(a) => [a.fullName, a.district, <StatusBadge key="s" value={a.status} />]}
            />
          </Card>
        </section>
      )}

      {role === "COMMITTEE" && (
        <section className="mt-8">
          <Card>
            <CardHeader eyebrow="My queue" title="Interview queue" />
            <PipelineTable
              rows={interviewQueue}
              empty="No applicants awaiting interview decisions."
              columns={["Name", "District", "Score (avg)", "Status"]}
              render={(a) => {
                const scores = a.interview?.scores ?? [];
                const avg = scores.length
                  ? (
                      scores.reduce((s, x) => s + x.academicMerit + x.financialNeed + x.communication + x.intentClarity, 0) /
                      (scores.length * 4)
                    ).toFixed(1)
                  : "–";
                return [a.fullName, a.district, <span key="v" className="font-mono tabular-nums">{avg}</span>, <StatusBadge key="s" value={a.status} />];
              }}
            />
          </Card>
        </section>
      )}

      {role === "STAFF" && (
        <>
          <section className="mt-8">
            <Card>
              <CardHeader eyebrow="Latest 25" title="Full pipeline" />
              <PipelineTable
                rows={fullPipeline}
                empty="No applicants yet."
                columns={["Name", "District", "Volunteer", "Status"]}
                render={(a) => [a.fullName, a.district, a.volunteer?.name ?? "Unassigned", <StatusBadge key="s" value={a.status} />]}
              />
            </Card>
          </section>

          <section className="mt-6">
            <Card className="border-danger/30 bg-danger-soft/40">
              <CardHeader
                eyebrow="Needs attention"
                title={`At-risk students (${atRiskStudents.length})`}
                description="Unresolved risk flags, surfaced across every mentor."
                action={<AlertTriangle className="size-4 text-danger" aria-hidden />}
              />
              <CardBody>
                {atRiskStudents.length === 0 ? (
                  <p className="text-sm text-ink-muted">No open risk flags right now.</p>
                ) : (
                  <ul className="space-y-2">
                    {atRiskStudents.map((s) => (
                      <li key={s.id} className="text-sm text-ink">
                        <span className="font-medium">{s.user.name}</span>
                        <span className="text-ink-muted"> · mentor {s.mentor?.user.name ?? "unassigned"} — {s.mentorLogs.map((l) => l.note).join("; ")}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardBody>
            </Card>
          </section>
        </>
      )}
    </AppShell>
  );
}

function PipelineTable<T>({
  rows,
  columns,
  render,
  empty,
}: {
  rows: T[];
  columns: string[];
  render: (row: T) => React.ReactNode[];
  empty: string;
}) {
  if (rows.length === 0) {
    return (
      <div className="p-5 pt-0">
        <EmptyState icon={ListChecks} title={empty} />
      </div>
    );
  }
  return (
    <div className="px-5 pb-5">
      <TableScroll>
        <Table>
          <Thead>
            <tr>
              {columns.map((c) => (
                <Th key={c}>{c}</Th>
              ))}
            </tr>
          </Thead>
          <tbody>
            {rows.map((row, i) => (
              <Tr key={i}>
                {render(row).map((cell, j) => (
                  <Td key={j}>{cell}</Td>
                ))}
              </Tr>
            ))}
          </tbody>
        </Table>
      </TableScroll>
    </div>
  );
}
