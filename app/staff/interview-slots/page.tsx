import { CalendarPlus } from "lucide-react";
import { requireRole } from "@/lib/auth-helpers";
import { getUpcomingSlots } from "@/lib/interview-slots";
import { getStaffNav } from "@/lib/staff-nav";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Field } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/empty-state";
import { createInterviewSlot } from "./actions";

export default async function InterviewSlotsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const session = await requireRole(["COMMITTEE"]);
  const { error } = await searchParams;

  const slots = await getUpcomingSlots();
  const nav = await getStaffNav("COMMITTEE", session.user.id);

  return (
    <AppShell role="COMMITTEE" name={session.user.name ?? "Committee"} nav={nav}>
      <PageHeader
        eyebrow="Selection"
        title="Interview slots"
        description="Declare when the panel is available. Applicants get scheduled into these slots rather than an arbitrary time."
      />

      {error && <p className="mb-4 text-sm text-danger">{decodeURIComponent(error)}</p>}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader eyebrow="Upcoming" title="Open & upcoming slots" />
            <CardBody>
              {slots.length === 0 ? (
                <EmptyState icon={CalendarPlus} title="No slots declared yet" description="Add one using the form." />
              ) : (
                <ul className="divide-y divide-border">
                  {slots.map((s) => {
                    const full = s._count.interviews >= s.capacity;
                    return (
                      <li key={s.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                        <div>
                          <p className="text-sm font-medium text-ink">
                            {s.scheduledAt.toLocaleString()} · {s.location}
                          </p>
                          <p className="text-xs text-ink-faint">Declared by {s.createdBy.name}</p>
                        </div>
                        <Badge tone={full ? "danger" : "success"}>
                          {s._count.interviews}/{s.capacity} booked
                        </Badge>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardBody>
          </Card>
        </div>

        <Card>
          <CardHeader eyebrow="New" title="Declare a slot" />
          <CardBody>
            <form action={createInterviewSlot} className="space-y-4">
              <Field label="Date & time" type="datetime-local" name="scheduledAt" required />
              <Field label="Location" name="location" required defaultValue="Maatram Foundation Centre, Chennai" />
              <Field label="Capacity (applicants)" type="number" name="capacity" min={1} max={20} required defaultValue={3} />
              <Button type="submit" variant="primary" className="w-full">
                Add slot
              </Button>
            </form>
          </CardBody>
        </Card>
      </div>
    </AppShell>
  );
}
