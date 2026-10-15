import Link from "next/link";
import { ListChecks, AlertTriangle, UserPlus } from "lucide-react";
import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { DISTRICTS } from "@/lib/constants";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { StatStrip } from "@/components/ui/stat-strip";
import { Table, Thead, Th, Tr, Td, TableScroll } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { ApplicationStatus } from "@prisma/client";

const APPLICANT_STAGE_ORDER = [
  "DRAFT",
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

export default async function StaffHome({
  searchParams,
}: {
  searchParams: Promise<{ district?: string; collegeId?: string; status?: string }>;
}) {
  const session = await requireRole(["STAFF", "COMMITTEE", "VOLUNTEER"]);
  const role = session.user.role;
  const filters = await searchParams;

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

  const colleges = role === "STAFF" ? await prisma.college.findMany({ orderBy: { name: "asc" } }) : [];
  const fullPipeline =
    role === "STAFF"
      ? await prisma.applicant.findMany({
          where: {
            ...(filters.district ? { district: filters.district } : {}),
            ...(filters.collegeId ? { preferredCollegeId: filters.collegeId } : {}),
            ...(filters.status ? { status: filters.status as ApplicationStatus } : {}),
          },
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
        action={
          role === "VOLUNTEER" ? (
            <Button href="/apply/assist" variant="primary" size="sm">
              <UserPlus className="size-4" aria-hidden /> Start a visit application
            </Button>
          ) : undefined
        }
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
              hrefFor={(a) => `/staff/applicants/${a.id}`}
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
              hrefFor={(a) => `/staff/applicants/${a.id}`}
            />
          </Card>
        </section>
      )}

      {role === "STAFF" && (
        <>
          <section className="mt-8">
            <Card>
              <CardHeader eyebrow="Latest 25" title="Full pipeline" />
              <form method="GET" className="grid grid-cols-1 gap-3 px-5 pb-4 sm:grid-cols-3">
                <Select label="District" name="district" defaultValue={filters.district ?? ""} placeholder="All districts">
                  {DISTRICTS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </Select>
                <Select label="College" name="collegeId" defaultValue={filters.collegeId ?? ""} placeholder="All colleges">
                  {colleges.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </Select>
                <div className="flex items-end gap-2">
                  <Select label="Status" name="status" defaultValue={filters.status ?? ""} placeholder="All statuses" className="flex-1">
                    {APPLICANT_STAGE_ORDER.map((s) => (
                      <option key={s} value={s}>
                        {s.replaceAll("_", " ")}
                      </option>
                    ))}
                  </Select>
                  <Button type="submit" variant="secondary" size="md">
                    Filter
                  </Button>
                </div>
              </form>
              <PipelineTable
                rows={fullPipeline}
                empty="No applicants match these filters."
                columns={["Name", "District", "Volunteer", "Status"]}
                render={(a) => [a.fullName, a.district, a.volunteer?.name ?? "Unassigned", <StatusBadge key="s" value={a.status} />]}
                hrefFor={(a) => `/staff/applicants/${a.id}`}
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
  hrefFor,
}: {
  rows: T[];
  columns: string[];
  render: (row: T) => React.ReactNode[];
  empty: string;
  hrefFor?: (row: T) => string;
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
            {rows.map((row, i) => {
              const cells = render(row);
              return (
                <Tr key={i}>
                  {cells.map((cell, j) =>
                    j === 0 && hrefFor ? (
                      <Td key={j}>
                        <Link href={hrefFor(row)} className="font-medium text-accent hover:text-accent-strong">
                          {cell}
                        </Link>
                      </Td>
                    ) : (
                      <Td key={j}>{cell}</Td>
                    ),
                  )}
                </Tr>
              );
            })}
          </tbody>
        </Table>
      </TableScroll>
    </div>
  );
}
