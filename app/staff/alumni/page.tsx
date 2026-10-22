import { Users2, Search, RotateCcw } from "lucide-react";
import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getStaffNav } from "@/lib/staff-nav";
import { findAlumniAtCompany } from "@/lib/alumni-career";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Field, Select, TextArea } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, Thead, Th, Tr, Td, TableScroll } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { logStaffCareerEvent, replayAllAlumniProfiles } from "./actions";

const SOURCE_LABEL: Record<string, string> = {
  SELF_REPORTED: "Self-reported",
  REFERRAL: "Referral",
  PLACEMENT: "Placement",
};

export default async function StaffAlumniPage({
  searchParams,
}: {
  searchParams: Promise<{ company?: string; result?: string; error?: string }>;
}) {
  const session = await requireRole(["STAFF"]);
  const { company, result, error } = await searchParams;
  const nav = await getStaffNav("STAFF", session.user.id);

  const [allAlumni, searchResults] = await Promise.all([
    prisma.alumniProfile.findMany({
      include: { student: { include: { user: true } } },
      orderBy: { createdAt: "desc" },
    }),
    company ? findAlumniAtCompany(company) : Promise.resolve([]),
  ]);

  return (
    <AppShell role="STAFF" name={session.user.name ?? "Staff"} nav={nav}>
      <PageHeader
        eyebrow="Alumni"
        title="Career tracker"
        description="Current position is a projection, replayed from each alumnus's career history — never edited directly."
      />

      {result && <div className="mb-4 rounded-md border border-success/30 bg-success-soft/50 px-3 py-2 text-sm text-success">{decodeURIComponent(result)}</div>}
      {error && <p className="mb-4 text-sm text-danger">{decodeURIComponent(error)}</p>}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          <Card>
            <CardHeader eyebrow="Query" title="Who works at…" action={<Search className="size-4 text-ink-faint" aria-hidden />} />
            <CardBody>
              <form method="GET" className="flex gap-2">
                <Field label="Company" name="company" placeholder="e.g. Zoho, TCS, Tata Consultancy Services…" defaultValue={company ?? ""} className="flex-1" />
                <Button type="submit" variant="primary" className="h-[38px] self-end">
                  Search
                </Button>
              </form>
              {company && (
                <div className="mt-4 border-t border-border pt-4">
                  <p className="text-xs text-ink-faint">
                    Matched on normalized name — merges spelling/suffix variants automatically.
                  </p>
                  {searchResults.length === 0 ? (
                    <p className="mt-2 text-sm text-ink-faint">No alumni currently at a company matching &ldquo;{company}&rdquo;.</p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {searchResults.map((r) => (
                        <li key={r.id} className="flex items-center justify-between gap-2 text-sm text-ink">
                          <span>
                            <span className="font-medium">{r.alumniProfile.student.user.name}</span> — {r.role} at {r.company}
                          </span>
                          <Badge tone="neutral">{SOURCE_LABEL[r.source]}</Badge>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader eyebrow="Directory" title={`All alumni (${allAlumni.length})`} />
            {allAlumni.length === 0 ? (
              <div className="p-5 pt-0">
                <EmptyState icon={Users2} title="No alumni yet" />
              </div>
            ) : (
              <div className="px-5 pb-5">
                <TableScroll>
                  <Table>
                    <Thead>
                      <tr>
                        <Th>Name</Th>
                        <Th>Current role</Th>
                        <Th>Current company</Th>
                      </tr>
                    </Thead>
                    <tbody>
                      {allAlumni.map((a) => (
                        <Tr key={a.id}>
                          <Td>{a.student.user.name}</Td>
                          <Td className="text-ink-muted">{a.currentRole ?? "—"}</Td>
                          <Td className="text-ink-muted">{a.currentCompany ?? "—"}</Td>
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
          <Card>
            <CardHeader eyebrow="Log" title="Add a career event" description="Referral or placement — self-reports come from the alumnus's own portal." />
            <CardBody>
              <form action={logStaffCareerEvent} className="space-y-3">
                <Select label="Alumnus" name="alumniProfileId" required placeholder="Select">
                  {allAlumni.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.student.user.name}
                    </option>
                  ))}
                </Select>
                <Select label="Source" name="source" required defaultValue="PLACEMENT">
                  <option value="PLACEMENT">Placement</option>
                  <option value="REFERRAL">Referral</option>
                </Select>
                <Field label="Company" name="company" required />
                <Field label="Role" name="role" required />
                <Field label="Start date" type="date" name="startDate" required />
                <TextArea label="Notes (optional)" name="notes" rows={2} />
                <Button type="submit" variant="primary" className="w-full">
                  Add career event
                </Button>
              </form>
            </CardBody>
          </Card>

          <Card>
            <CardHeader eyebrow="Replay" title="Recompute from history" />
            <CardBody className="space-y-3">
              <p className="text-xs text-ink-faint">
                Re-derives every alumnus&apos;s current position from their full CareerEvent history — proves the
                projection is reproducible, not just cached.
              </p>
              <form action={replayAllAlumniProfiles}>
                <Button type="submit" variant="secondary" className="w-full">
                  <RotateCcw className="size-4" aria-hidden /> Recompute all profiles
                </Button>
              </form>
            </CardBody>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
