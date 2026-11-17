import Link from "next/link";
import { Search, UserRoundSearch } from "lucide-react";
import type { ApplicationStatus } from "@prisma/client";
import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { DISTRICTS } from "@/lib/constants";
import { getStaffNav } from "@/lib/staff-nav";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { StatusBadge } from "@/components/ui/badge";
import { Card, CardBody } from "@/components/ui/card";
import { StatStrip } from "@/components/ui/stat-strip";
import { Field, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, TableScroll, Td, Th, Thead, Tr } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";

const STATUSES: ApplicationStatus[] = [
  "DRAFT", "SUBMITTED", "UNDER_VERIFICATION", "VERIFIED", "INTERVIEW_SCHEDULED",
  "INTERVIEWED", "SHORTLISTED", "ACCEPTED", "REJECTED", "WAITLISTED", "WITHDRAWN",
];
const PAGE_SIZE = 25;

export default async function ApplicantManagementPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; cycle?: string; district?: string; community?: string; status?: string; page?: string }>;
}) {
  const session = await requireRole(["STAFF"]);
  const params = await searchParams;
  const q = (params.q ?? "").trim().slice(0, 100);
  const cycleId = params.cycle ?? "";
  const district = DISTRICTS.includes(params.district ?? "") ? params.district! : "";
  const community = (params.community ?? "").trim().slice(0, 80);
  const status = STATUSES.includes(params.status as ApplicationStatus) ? params.status as ApplicationStatus : undefined;
  const requestedPage = Number.parseInt(params.page ?? "1", 10);
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const baseWhere = {
    ...(cycleId ? { cycleId } : {}),
    ...(district ? { district } : {}),
    ...(community ? { community: { contains: community, mode: "insensitive" as const } } : {}),
    ...(status ? { status } : {}),
    ...(q ? { OR: [
      { fullName: { contains: q, mode: "insensitive" as const } },
      { phone: { contains: q } },
      { id: { contains: q, mode: "insensitive" as const } },
    ] } : {}),
  };

  const cycleFilter = cycleId ? { cycleId } : {};
  const [cycles, counts, total, nav, allApplicants, submittedApplicants, pendingCalls, completedCalls, pendingPhysical, completedPhysical, scheduledInterviews, scheduledFinalMeetings] = await Promise.all([
    prisma.admissionCycle.findMany({ orderBy: { year: "desc" }, select: { id: true, year: true } }),
    prisma.applicant.groupBy({ by: ["status"], where: cycleFilter, _count: { _all: true } }),
    prisma.applicant.count({ where: baseWhere }),
    getStaffNav("STAFF", session.user.id),
    prisma.applicant.count({ where: cycleFilter }),
    prisma.applicant.count({ where: { ...cycleFilter, status: { not: "DRAFT" } } }),
    prisma.applicant.count({ where: { ...cycleFilter, status: { in: ["SUBMITTED", "UNDER_VERIFICATION"] }, callVerifications: { none: { status: "VERIFICATION_COMPLETED" } } } }),
    prisma.callVerification.groupBy({ by: ["applicantId"], where: { status: "VERIFICATION_COMPLETED", applicant: cycleFilter } }),
    prisma.applicant.count({ where: { ...cycleFilter, status: "UNDER_VERIFICATION", callVerifications: { some: { status: "VERIFICATION_COMPLETED" } }, verification: null } }),
    prisma.applicant.count({ where: { ...cycleFilter, verification: { is: { decision: "APPROVED" } } } }),
    prisma.applicant.count({ where: { ...cycleFilter, status: "INTERVIEW_SCHEDULED" } }),
    prisma.offlineMeeting.count({ where: { outcome: { in: ["SCHEDULED", "RESCHEDULED"] }, applicant: cycleFilter } }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, pages);
  const applicants = await prisma.applicant.findMany({
    where: baseWhere,
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    skip: (currentPage - 1) * PAGE_SIZE,
    take: PAGE_SIZE,
    select: {
      id: true, fullName: true, phone: true, district: true, community: true,
      status: true, updatedAt: true, createdAt: true, submittedAt: true,
      cycle: { select: { year: true } },
      volunteer: { select: { name: true } },
    },
  });
  const countByStatus = Object.fromEntries(counts.map((row) => [row.status, row._count._all]));
  const queryForPage = (nextPage: number) => {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (cycleId) next.set("cycle", cycleId);
    if (district) next.set("district", district);
    if (community) next.set("community", community);
    if (status) next.set("status", status);
    next.set("page", String(nextPage));
    return `/staff/applicants?${next.toString()}`;
  };

  return (
    <AppShell role="STAFF" name={session.user.name ?? "Staff"} nav={nav}>
      <PageHeader eyebrow="Admission" title="Applicant management" description="Search applications, review progress, and open a complete applicant record." />

      <div className="mb-5 space-y-2.5">
        <StatStrip items={[
          { label: "Total applicants", value: allApplicants },
          { label: "Submitted", value: submittedApplicants },
          { label: "Call pending", value: pendingCalls },
          { label: "Call completed", value: completedCalls.length },
          { label: "Physical pending", value: pendingPhysical },
          { label: "Physical completed", value: completedPhysical },
          { label: "Online interviews", value: scheduledInterviews },
          { label: "Final meetings", value: scheduledFinalMeetings },
          { label: "Selected", value: countByStatus.ACCEPTED ?? 0 },
          { label: "Rejected", value: countByStatus.REJECTED ?? 0 },
        ]} />
      </div>

      <Card className="mb-5">
        <CardBody>
          <form method="GET" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <div className="xl:col-span-2"><Field label="Search name, phone, or application ID" name="q" defaultValue={q} placeholder="e.g. Anitha or MH26…" /></div>
            <Select label="Admission cycle" name="cycle" defaultValue={cycleId} placeholder="All cycles">
              {cycles.map((cycle) => <option key={cycle.id} value={cycle.id}>{cycle.year}</option>)}
            </Select>
            <Select label="District" name="district" defaultValue={district} placeholder="All districts">
              {DISTRICTS.map((value) => <option key={value} value={value}>{value}</option>)}
            </Select>
            <Field label="Community" name="community" defaultValue={community} placeholder="Any community" />
            <Select label="Status" name="status" defaultValue={status ?? ""} placeholder="All statuses">
              {STATUSES.map((value) => <option key={value} value={value}>{value.replaceAll("_", " ")}</option>)}
            </Select>
            <div className="flex items-end gap-2 xl:col-span-6">
              <Button type="submit" variant="primary" size="sm"><Search className="size-4" aria-hidden /> Apply filters</Button>
              <Button href="/staff/applicants" variant="secondary" size="sm">Clear</Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <div className="flex items-center justify-between gap-3 px-5 py-4">
          <div><h2 className="text-sm font-semibold text-ink">Applications</h2><p className="mt-0.5 text-xs text-ink-faint">{total} result{total === 1 ? "" : "s"} · page {currentPage} of {pages}</p></div>
        </div>
        {applicants.length === 0 ? <div className="p-5 pt-0"><EmptyState icon={UserRoundSearch} title="No applicants found" description="Try changing or clearing the filters." /></div> : (
          <div className="px-5 pb-5">
            <TableScroll><Table>
              <Thead><tr><Th>Applicant</Th><Th>Application ID</Th><Th>Cycle</Th><Th>District</Th><Th>Community</Th><Th>Assigned member</Th><Th>Status</Th><Th>Updated</Th></tr></Thead>
              <tbody>{applicants.map((applicant) => <Tr key={applicant.id}>
                <Td><Link href={`/staff/applicants/${applicant.id}`} className="font-medium text-accent hover:text-accent-strong">{applicant.fullName}</Link><p className="mt-0.5 text-xs text-ink-faint">{applicant.phone}</p></Td>
                <Td className="font-mono text-xs">{applicant.id}</Td>
                <Td>{applicant.cycle?.year ?? "Legacy"}</Td>
                <Td>{applicant.district}</Td>
                <Td>{applicant.community ?? "—"}</Td>
                <Td>{applicant.volunteer?.name ?? "Unassigned"}</Td>
                <Td><StatusBadge value={applicant.status} /></Td>
                <Td className="whitespace-nowrap text-xs text-ink-faint">{applicant.updatedAt.toLocaleDateString()}</Td>
              </Tr>)}</tbody>
            </Table></TableScroll>
            <nav aria-label="Applicant pages" className="mt-4 flex items-center justify-between gap-3 text-sm">
              <span className="text-xs text-ink-faint">Showing {(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, total)} of {total}</span>
              <div className="flex gap-2">
                {currentPage > 1 && <Button href={queryForPage(currentPage - 1)} variant="secondary" size="sm">Previous</Button>}
                {currentPage < pages && <Button href={queryForPage(currentPage + 1)} variant="secondary" size="sm">Next</Button>}
              </div>
            </nav>
          </div>
        )}
      </Card>
    </AppShell>
  );
}
