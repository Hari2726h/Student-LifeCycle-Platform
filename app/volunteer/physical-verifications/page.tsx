import Link from "next/link";
import type { ApplicationStatus, Prisma } from "@prisma/client";
import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { VolunteerShell } from "@/components/volunteer-shell";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";

type Search = { q?: string; status?: string; from?: string; to?: string; columns?: string | string[] };
const AVAILABLE_COLUMNS = ["application", "student", "mobile", "district", "assigned", "status", "description"] as const;

export default async function PhysicalVerificationList({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await requireRole(["VOLUNTEER"]);
  const filters = await searchParams;
  const q = filters.q?.trim() ?? "";
  const status = ["SUBMITTED", "UNDER_VERIFICATION", "VERIFIED", "REJECTED", "WITHDRAWN"].includes(filters.status ?? "") ? filters.status : undefined;
  const from = filters.from ? new Date(filters.from) : undefined;
  const to = filters.to ? new Date(`${filters.to}T23:59:59.999`) : undefined;
  const andFilters: Prisma.ApplicantWhereInput[] = [{
    OR: [
      { volunteerId: session.user.id },
      { volunteerActivities: { some: { type: "PHYSICAL_VERIFICATION", assignments: { some: { volunteerId: session.user.id } } } } },
    ],
  }];
  if (q) andFilters.push({ OR: [
    { fullName: { contains: q, mode: "insensitive" } },
    { phone: { contains: q } },
    { district: { contains: q, mode: "insensitive" } },
    { id: { contains: q, mode: "insensitive" } },
  ] });
  if (status) andFilters.push({ status: status as ApplicationStatus });
  if (from || to) andFilters.push({ createdAt: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } });
  const applications = await prisma.applicant.findMany({
    where: { AND: andFilters },
    include: {
      verification: true,
      physicalVerificationReports: { orderBy: { createdAt: "desc" }, take: 1 },
      volunteerActivities: { where: { type: "PHYSICAL_VERIFICATION", assignments: { some: { volunteerId: session.user.id } } }, select: { id: true, startsAt: true, dueAt: true } },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });
  const columnValues = Array.isArray(filters.columns) ? filters.columns : filters.columns?.split(",");
  const selected = columnValues?.filter((column) => AVAILABLE_COLUMNS.includes(column as (typeof AVAILABLE_COLUMNS)[number])) ?? ["application", "student", "mobile", "district", "status", "description"];
  const has = (key: string) => selected.includes(key);

  return (
    <VolunteerShell name={session.user.name ?? "Volunteer"}>
      <PageHeader eyebrow="Verification" title="Physical verification" description="Home visits and field reports for applications assigned to you." />
      <Card className="mb-4"><CardBody><form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
        <Field label="Search application or student" name="q" defaultValue={q} placeholder="Name, phone, district, ID" />
        <Select label="Verification status" name="status" defaultValue={status ?? ""} placeholder="All statuses"><option value="SUBMITTED">Submitted</option><option value="UNDER_VERIFICATION">Under verification</option><option value="VERIFIED">Verified</option><option value="REJECTED">Rejected</option><option value="WITHDRAWN">Withdrawn</option></Select>
        <Field label="Assigned from" name="from" type="date" defaultValue={filters.from} />
        <Field label="Assigned to" name="to" type="date" defaultValue={filters.to} />
        <Button type="submit" variant="secondary">Filter</Button>
        <fieldset className="sm:col-span-2 lg:col-span-5"><legend className="mb-2 text-xs font-medium text-ink-muted">Visible columns</legend><div className="flex flex-wrap gap-x-4 gap-y-2 text-xs">{AVAILABLE_COLUMNS.map((column) => <label key={column} className="flex items-center gap-1.5"><input type="checkbox" name="columns" value={column} defaultChecked={selected.includes(column)} />{column[0].toUpperCase() + column.slice(1)}</label>)}</div></fieldset>
      </form></CardBody></Card>
      <div className="overflow-x-auto rounded-lg border border-border bg-surface">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead className="border-b border-border bg-surface-sunken text-xs uppercase text-ink-faint"><tr>
            {has("application") && <th className="px-4 py-3">Application #</th>}{has("student") && <th className="px-4 py-3">Student</th>}{has("mobile") && <th className="px-4 py-3">Mobile</th>}{has("district") && <th className="px-4 py-3">District</th>}{has("assigned") && <th className="px-4 py-3">Visit window</th>}{has("status") && <th className="px-4 py-3">PV status</th>}{has("description") && <th className="px-4 py-3">Description</th>}<th className="px-4 py-3">Action</th>
          </tr></thead>
          <tbody>{applications.map((applicant) => {
            const activity = applicant.volunteerActivities[0];
            const href = activity ? `/volunteer/physical-verifications/${applicant.id}?activityId=${activity.id}` : `/volunteer/physical-verifications/${applicant.id}`;
            return <tr key={applicant.id} className="border-b border-border last:border-0">
              {has("application") && <td className="px-4 py-3 font-mono text-xs">{applicant.id.slice(-10).toUpperCase()}</td>}{has("student") && <td className="px-4 py-3 font-medium">{applicant.fullName}</td>}{has("mobile") && <td className="px-4 py-3">{applicant.phone}</td>}{has("district") && <td className="px-4 py-3">{applicant.district}</td>}{has("assigned") && <td className="px-4 py-3">{activity ? `${activity.startsAt.toLocaleDateString()} – ${activity.dueAt?.toLocaleDateString() ?? "—"}` : "Assigned to you"}</td>}{has("status") && <td className="px-4 py-3"><StatusBadge value={applicant.verification?.decision ?? applicant.status} /></td>}{has("description") && <td className="px-4 py-3">{applicant.physicalVerificationReports[0]?.pvReason ?? applicant.courseInterest ?? "—"}</td>}<td className="px-4 py-3"><Link className="text-accent hover:underline" href={href}>View details</Link></td>
            </tr>;
          })}</tbody>
        </table>
        {!applications.length && <p className="p-8 text-center text-sm text-ink-muted">No assigned applications match these filters.</p>}
      </div>
      <p className="mt-3 text-xs text-ink-faint">Showing up to 100 assigned applications. Student details are visible only to the assigned volunteer.</p>
    </VolunteerShell>
  );
}
