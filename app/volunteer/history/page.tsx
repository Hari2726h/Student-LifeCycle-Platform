import Link from "next/link";
import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { VolunteerShell } from "@/components/volunteer-shell";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardBody } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";

type HistoryItem = { id: string; date: Date; type: string; name: string; status: string; comments: string; reviewer: string; href?: string };
type Search = { type?: string; status?: string; from?: string; to?: string };

export default async function VolunteerHistory({ searchParams }: { searchParams: Promise<Search> }) {
  const session = await requireRole(["VOLUNTEER"]);
  const filters = await searchParams;
  const from = filters.from ? new Date(filters.from) : undefined;
  const to = filters.to ? new Date(`${filters.to}T23:59:59.999`) : undefined;
  const dateFilter = from || to ? { gte: from, lte: to } : undefined;
  const [reports, calls, physical, tutoring] = await Promise.all([
    prisma.activityReport.findMany({
      where: { volunteerId: session.user.id, activity: { type: { in: ["SCHOOL_VISIT", "SANTA_PROGRAMME", "OTHER"] } }, ...(dateFilter ? { createdAt: dateFilter } : {}), ...(filters.status === "PENDING" ? { reviewStatus: "PENDING" } : filters.status === "APPROVED" ? { reviewStatus: "APPROVED" } : filters.status === "FOLLOW_UP" ? { reviewStatus: "FOLLOW_UP" } : {}) },
      include: { activity: { select: { name: true, type: true } }, reviewedBy: { select: { name: true } } },
      orderBy: { createdAt: "desc" }, take: 100,
    }),
    prisma.callVerification.findMany({ where: { volunteerId: session.user.id, ...(dateFilter ? { calledAt: dateFilter } : {}), ...(filters.status && ["CONNECTED", "NOT_REACHABLE", "SWITCHED_OFF", "CALL_LATER", "WRONG_NUMBER", "VERIFICATION_COMPLETED"].includes(filters.status) ? { status: filters.status as never } : {}) }, include: { applicant: { select: { id: true, fullName: true } } }, orderBy: { calledAt: "desc" }, take: 100 }),
    prisma.physicalVerificationReport.findMany({ where: { volunteerId: session.user.id, ...(dateFilter ? { createdAt: dateFilter } : {}), ...(filters.status && ["APPROVED", "REJECTED", "NEEDS_FOLLOW_UP"].includes(filters.status) ? { decision: filters.status as never } : {}) }, include: { applicant: { select: { id: true, fullName: true } } }, orderBy: { createdAt: "desc" }, take: 100 }),
    prisma.tutoringSession.findMany({ where: { volunteerId: session.user.id, ...(dateFilter ? { createdAt: dateFilter } : {}) }, orderBy: { createdAt: "desc" }, take: 100 }),
  ]);
  const items: HistoryItem[] = [
    ...reports.map((item) => ({ id: item.id, date: item.createdAt, type: item.activity.type, name: item.activity.name, status: item.reviewStatus, comments: item.reviewNote ?? "Report submitted", reviewer: item.reviewedBy?.name ?? "Awaiting review", href: `/volunteer/activities/${item.activityId}` })),
    ...calls.map((item) => ({ id: item.id, date: item.calledAt, type: "CALL_VERIFICATION", name: `${item.applicant.fullName} · attempt ${item.attemptNumber}`, status: item.status, comments: item.comments ?? "Call attempt recorded", reviewer: item.volunteerId === session.user.id ? "You" : "Assigned volunteer", href: "/volunteer/call-verifications" })),
    ...physical.map((item) => ({ id: item.id, date: item.createdAt, type: "PHYSICAL_VERIFICATION", name: item.applicant.fullName, status: item.decision, comments: item.observations ?? item.recommendation ?? "Visit report submitted", reviewer: "Awaiting staff review", href: `/volunteer/physical-verifications/${item.applicantId}` })),
    ...tutoring.map((item) => ({ id: item.id, date: item.createdAt, type: "TUTORING", name: `${item.studentName} · ${item.subject}`, status: item.attendance, comments: `${item.topic}${item.comments ? ` · ${item.comments}` : ""}`, reviewer: "—", href: "/volunteer/tutoring" })),
  ].filter((item) => !filters.type || item.type === filters.type).sort((a, b) => b.date.getTime() - a.date.getTime()).slice(0, 200);

  return (
    <VolunteerShell name={session.user.name ?? "Volunteer"}>
      <PageHeader eyebrow="Contribution" title="Activity history" description="Your submitted reports, field verification and tutoring records." />
      <form method="get" className="mb-4 grid gap-3 rounded-lg border border-border bg-surface p-4 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
        <Select label="Activity type" name="type" defaultValue={filters.type ?? ""} placeholder="All types"><option value="PHYSICAL_VERIFICATION">Physical verification</option><option value="CALL_VERIFICATION">Call verification</option><option value="TUTORING">Tutoring</option><option value="SCHOOL_VISIT">School visit</option><option value="SANTA_PROGRAMME">Santa programme</option><option value="OTHER">Other</option></Select>
        <Select label="Status" name="status" defaultValue={filters.status ?? ""} placeholder="All statuses"><option value="PENDING">Pending review</option><option value="APPROVED">Approved</option><option value="FOLLOW_UP">Follow-up</option><option value="CONNECTED">Connected</option><option value="VERIFICATION_COMPLETED">Verification completed</option><option value="NEEDS_FOLLOW_UP">Needs follow-up</option><option value="REJECTED">Rejected</option><option value="PRESENT">Present</option><option value="ABSENT">Absent</option></Select>
        <Field label="From" name="from" type="date" defaultValue={filters.from} /><Field label="To" name="to" type="date" defaultValue={filters.to} /><Button type="submit" variant="secondary">Filter history</Button>
      </form>
      <Card><CardBody className="overflow-x-auto">
        {items.length ? <table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b border-border text-xs uppercase text-ink-faint"><tr><th className="py-2 pr-3">Date</th><th className="py-2 pr-3">Activity type / name</th><th className="py-2 pr-3">Previous status</th><th className="py-2 pr-3">Current status</th><th className="py-2 pr-3">Submitted comments</th><th className="py-2 pr-3">Reviewed by</th><th className="py-2">View</th></tr></thead><tbody>{items.map((item) => <tr key={`${item.type}:${item.id}`} className="border-b border-border last:border-0"><td className="py-3 pr-3">{item.date.toLocaleDateString()}</td><td className="py-3 pr-3"><p>{item.type.replaceAll("_", " ")}</p><p className="text-xs text-ink-muted">{item.name}</p></td><td className="py-3 pr-3 text-ink-muted">—</td><td className="py-3 pr-3"><StatusBadge value={item.status} /></td><td className="max-w-[260px] py-3 pr-3 text-ink-muted">{item.comments}</td><td className="py-3 pr-3">{item.reviewer}</td><td className="py-3"><Link className="text-accent hover:underline" href={item.href ?? "#"}>Open</Link></td></tr>)}</tbody></table> : <p className="py-8 text-center text-sm text-ink-muted">No activity history matches these filters.</p>}
      </CardBody></Card>
      <p className="mt-3 text-xs text-ink-faint">Showing up to 200 records. Historical call attempts and verification reports remain available after status changes.</p>
    </VolunteerShell>
  );
}
