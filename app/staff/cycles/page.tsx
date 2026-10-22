import { CalendarRange } from "lucide-react";
import { requireRole } from "@/lib/auth-helpers";
import { getCycleStats } from "@/lib/cycles";
import { getStaffNav } from "@/lib/staff-nav";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Field } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, Thead, Th, Tr, Td, TableScroll } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import { createCycle } from "./actions";

export default async function CyclesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireRole(["STAFF"]);
  const { error } = await searchParams;
  const nav = await getStaffNav("STAFF", session.user.id);
  const stats = await getCycleStats();
  const now = new Date();

  return (
    <AppShell role="STAFF" name={session.user.name ?? "Staff"} nav={nav}>
      <PageHeader
        eyebrow="Admission"
        title="Cycles"
        description="Each year is a separate cycle. New applications can only start while one is open."
      />

      {error && <p className="mb-4 text-sm text-danger">{decodeURIComponent(error)}</p>}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader eyebrow="Year-over-year" title="Comparison" />
            {stats.length === 0 ? (
              <div className="p-5 pt-0">
                <EmptyState icon={CalendarRange} title="No cycles yet" description="Create one to open applications." />
              </div>
            ) : (
              <div className="px-5 pb-5">
                <TableScroll>
                  <Table>
                    <Thead>
                      <tr>
                        <Th>Year</Th>
                        <Th>Window</Th>
                        <Th>Status</Th>
                        <Th className="text-right">Applied</Th>
                        <Th className="text-right">Shortlisted</Th>
                        <Th className="text-right">Accepted</Th>
                        <Th className="text-right">Rejected</Th>
                        <Th className="text-right">Placement rate</Th>
                      </tr>
                    </Thead>
                    <tbody>
                      {stats.map(({ cycle, total, counts, accepted, placementRate }) => {
                        const isOpen = cycle.opensAt <= now && cycle.closesAt >= now;
                        return (
                          <Tr key={cycle.id}>
                            <Td className="font-medium">{cycle.year}</Td>
                            <Td className="text-xs text-ink-faint">
                              {cycle.opensAt.toLocaleDateString()} – {cycle.closesAt.toLocaleDateString()}
                            </Td>
                            <Td>
                              <Badge tone={isOpen ? "success" : "neutral"}>{isOpen ? "Open" : "Closed"}</Badge>
                            </Td>
                            <Td className="text-right font-mono tabular-nums">{total}</Td>
                            <Td className="text-right font-mono tabular-nums">{counts.SHORTLISTED ?? 0}</Td>
                            <Td className="text-right font-mono tabular-nums">{accepted}</Td>
                            <Td className="text-right font-mono tabular-nums">{counts.REJECTED ?? 0}</Td>
                            <Td className="text-right font-mono tabular-nums">
                              {placementRate == null ? "—" : `${placementRate}%`}
                            </Td>
                          </Tr>
                        );
                      })}
                    </tbody>
                  </Table>
                </TableScroll>
              </div>
            )}
          </Card>
        </div>

        <Card>
          <CardHeader eyebrow="New" title="Open a cycle" />
          <CardBody>
            <form action={createCycle} className="space-y-3">
              <Field label="Year" type="number" name="year" min={2000} max={2100} required defaultValue={now.getFullYear()} />
              <Field label="Opens" type="date" name="opensAt" required />
              <Field label="Closes" type="date" name="closesAt" required />
              <Button type="submit" variant="primary" className="w-full">
                Create cycle
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </AppShell>
  );
}
