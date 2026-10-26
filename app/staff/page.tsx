import Link from "next/link";
import { AlertTriangle, UserPlus, ListChecks } from "lucide-react";
import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { DISTRICTS } from "@/lib/constants";
import { getStaffNav } from "@/lib/staff-nav";
import { getAtRiskStudents } from "@/lib/retention";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { StatStrip } from "@/components/ui/stat-strip";
import { Table, Thead, Th, Tr, Td, TableScroll } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { Select, Field } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import type { ApplicationStatus } from "@prisma/client";
import { bulkShortlist, bulkSelect, bulkReject } from "./bulk-actions";

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
  searchParams: Promise<{ district?: string; collegeId?: string; status?: string; result?: string; error?: string }>;
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

  const atRiskStudents = role === "STAFF" ? await getAtRiskStudents() : [];

  // Selecting an applicant (bulk or individual) only flips their status —
  // it doesn't pick a college/mentor, so the linked Student record can't be
  // created automatically. Surfaced here so an accepted applicant can never
  // silently sit unlinked just because nobody happened to click into them.
  const needsOnboarding =
    role === "STAFF"
      ? await prisma.applicant.findMany({
          where: { status: "ACCEPTED", student: null },
          orderBy: { updatedAt: "asc" },
        })
      : [];

  const nav = await getStaffNav(role, session.user.id);

  return (
    <AppShell role={role} name={session.user.name ?? "Staff"} nav={nav}>
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

      {filters.result && (
        <div className="mb-4 rounded-md border border-success/30 bg-success-soft/50 px-3 py-2 text-sm text-success">
          {decodeURIComponent(filters.result)}
        </div>
      )}
      {filters.error && <p className="mb-4 text-sm text-danger">{decodeURIComponent(filters.error)}</p>}

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
              <BulkPipelineTable rows={fullPipeline} />
            </Card>
          </section>

          <section className="mt-6">
            <Card className="border-danger/30 bg-danger-soft/40">
              <CardHeader
                eyebrow="Mentorship · a worklist, not just a report"
                title={`Needs follow-up (${atRiskStudents.length})`}
                description="Enrolled students: stalled 90+ days, declining GPA/attendance, or an unresolved mentor risk flag. Distinct from admission-time deservingness — see the applicant's own record for that."
                action={<AlertTriangle className="size-4 text-danger" aria-hidden />}
              />
              <CardBody>
                {atRiskStudents.length === 0 ? (
                  <p className="text-sm text-ink-muted">Nothing needs attention right now.</p>
                ) : (
                  <ul className="space-y-3">
                    {atRiskStudents.map((s) => {
                      const openFollowUps = s.followUps.filter((f) => f.status === "OPEN");
                      return (
                        <li key={s.id} className="rounded-md border border-border bg-surface p-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <Link href={`/staff/students/${s.id}`} className="text-sm font-medium text-accent hover:text-accent-strong">
                              {s.user.name}
                            </Link>
                            <div className="flex flex-wrap gap-1.5">
                              {s.reasons.includes("RISK_FLAG") && <Badge tone="danger">Risk flag</Badge>}
                              {s.reasons.includes("DECLINING") && <Badge tone="warning">Declining grades</Badge>}
                              {s.reasons.includes("STALLED") && <Badge tone="neutral">Stalled 90+ days</Badge>}
                            </div>
                          </div>
                          <p className="mt-1 text-xs text-ink-muted">
                            Mentor: {s.mentor?.user.name ?? "unassigned"}
                            {openFollowUps.length > 0 && ` · ${openFollowUps.length} open follow-up${openFollowUps.length > 1 ? "s" : ""}`}
                          </p>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </CardBody>
            </Card>
          </section>

          {needsOnboarding.length > 0 && (
            <section className="mt-6">
              <Card className="border-warning/30 bg-warning-soft/40">
                <CardHeader
                  eyebrow="Admission · a worklist, not just a status"
                  title={`Needs onboarding (${needsOnboarding.length})`}
                  description="Accepted, but not yet linked to a student record — pick their college and mentor to finish."
                  action={<UserPlus className="size-4 text-warning" aria-hidden />}
                />
                <CardBody>
                  <ul className="space-y-2">
                    {needsOnboarding.map((a) => (
                      <li key={a.id} className="flex items-center justify-between rounded-md border border-border bg-surface p-3">
                        <Link href={`/staff/applicants/${a.id}`} className="text-sm font-medium text-accent hover:text-accent-strong">
                          {a.fullName}
                        </Link>
                        <span className="text-xs text-ink-faint">{a.district}</span>
                      </li>
                    ))}
                  </ul>
                </CardBody>
              </Card>
            </section>
          )}
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

function BulkPipelineTable({
  rows,
}: {
  rows: { id: string; fullName: string; district: string; status: ApplicationStatus; volunteer: { name: string } | null }[];
}) {
  if (rows.length === 0) {
    return (
      <div className="p-5 pt-0">
        <EmptyState icon={ListChecks} title="No applicants match these filters." />
      </div>
    );
  }

  return (
    <form className="px-5 pb-5">
      <TableScroll>
        <Table>
          <Thead>
            <tr>
              <Th className="w-8" />
              <Th>Name</Th>
              <Th>District</Th>
              <Th>Volunteer</Th>
              <Th>Status</Th>
            </tr>
          </Thead>
          <tbody>
            {rows.map((a) => (
              <Tr key={a.id}>
                <Td>
                  <input type="checkbox" name="applicantIds" value={a.id} className="size-4 rounded border-border accent-accent" />
                </Td>
                <Td>
                  <Link href={`/staff/applicants/${a.id}`} className="font-medium text-accent hover:text-accent-strong">
                    {a.fullName}
                  </Link>
                </Td>
                <Td>{a.district}</Td>
                <Td>{a.volunteer?.name ?? "Unassigned"}</Td>
                <Td>
                  <StatusBadge value={a.status} />
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </TableScroll>

      <div className="mt-4 space-y-3 border-t border-border pt-4">
        <Field label="Reason (required for any bulk action below)" name="reason" placeholder="e.g. Below cutoff for this cycle's shortlist" required />
        <div className="flex flex-wrap gap-2">
          <Button type="submit" formAction={bulkShortlist} variant="secondary" size="sm">
            Shortlist selected
          </Button>
          <Button type="submit" formAction={bulkSelect} variant="primary" size="sm">
            Select selected
          </Button>
          <Button type="submit" formAction={bulkReject} variant="danger" size="sm">
            Reject selected
          </Button>
        </div>
        <p className="text-xs text-ink-faint">
          Shortlist works from submitted/verified; Select works from shortlisted/interviewed; Reject works from any
          non-final status. Applicants in the wrong state for the chosen action are skipped, not failed.
        </p>
      </div>
    </form>
  );
}
