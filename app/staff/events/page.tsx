import { History, RotateCcw, PlayCircle, Activity } from "lucide-react";
import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getStaffNav } from "@/lib/staff-nav";
import { RISK_FLAG_WORKER_NAME } from "@/lib/workers/risk-flag-notifier";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, Thead, Th, Tr, Td, TableScroll } from "@/components/ui/table";
import { processNewEvents, replayFromStart, replayFromTimestamp } from "./actions";
import { EventTicker } from "./event-ticker";

function timeAgo(date: Date) {
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ result?: string; error?: string }>;
}) {
  const session = await requireRole(["STAFF"]);
  const { result, error } = await searchParams;

  const [events, bookmark, notificationCount] = await Promise.all([
    prisma.event.findMany({ orderBy: { sequence: "desc" }, take: 50 }),
    prisma.replayBookmark.findUnique({ where: { workerName: RISK_FLAG_WORKER_NAME } }),
    prisma.notification.count({ where: { type: "RISK_FLAG" } }),
  ]);

  const lastSequence = bookmark?.lastSequence ?? 0;
  const [pendingCount, latest, lastProcessedEvent] = await Promise.all([
    prisma.event.count({ where: { type: "RISK_FLAG_LOGGED", sequence: { gt: lastSequence } } }),
    prisma.event.aggregate({ _max: { sequence: true } }),
    lastSequence > 0 ? prisma.event.findUnique({ where: { sequence: lastSequence } }) : null,
  ]);
  const latestSequence = latest._max.sequence ?? 0;

  const nav = await getStaffNav("STAFF", session.user.id);

  return (
    <AppShell role="STAFF" name={session.user.name ?? "Staff"} nav={nav}>
      <PageHeader
        eyebrow="Event log"
        title="Events & replay"
        description="Every status change and risk flag is appended here in the same transaction as the write — this is the audit trail, and what background workers replay from."
      />

      {result && (
        <div className="mb-4 rounded-md border border-success/30 bg-success-soft/50 px-3 py-2 text-sm text-success">
          {decodeURIComponent(result)}
        </div>
      )}
      {error && <p className="mb-4 text-sm text-danger">{decodeURIComponent(error)}</p>}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <Card>
            <CardHeader
              eyebrow="Latest 50"
              title="Event stream"
              action={<EventTicker initialLatestSequence={events[0]?.sequence ?? 0} />}
            />
            <div className="px-5 pb-5">
              <TableScroll>
                <Table>
                  <Thead>
                    <tr>
                      <Th>Seq</Th>
                      <Th>Type</Th>
                      <Th>Aggregate</Th>
                      <Th>Occurred</Th>
                    </tr>
                  </Thead>
                  <tbody>
                    {events.map((e) => (
                      <Tr key={e.id}>
                        <Td className="font-mono tabular-nums">{e.sequence}</Td>
                        <Td>
                          <Badge tone={e.type === "RISK_FLAG_LOGGED" ? "danger" : "neutral"}>{e.type}</Badge>
                        </Td>
                        <Td className="text-xs text-ink-faint">
                          {e.aggregateType}:{e.aggregateId.slice(0, 10)}…
                        </Td>
                        <Td className="text-xs text-ink-faint">{e.occurredAt.toLocaleString()}</Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </TableScroll>
            </div>
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader
              eyebrow="Ops"
              title="Replay health"
              description="Not a page that just exists — proof the pipeline is actually keeping up."
              action={<Activity className="size-4 text-ink-faint" aria-hidden />}
            />
            <CardBody className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-ink-muted">Pending (risk flags)</span>
                <span className={`font-mono tabular-nums ${pendingCount > 0 ? "text-warning" : "text-ink"}`}>{pendingCount}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">Bookmark lag (sequence)</span>
                <span className="font-mono tabular-nums text-ink">
                  {lastSequence} / {latestSequence}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">Last processed</span>
                <span className="text-ink">{lastProcessedEvent ? timeAgo(lastProcessedEvent.occurredAt) : "never"}</span>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader eyebrow="Worker" title="risk-flag-notifier" action={<History className="size-4 text-ink-faint" aria-hidden />} />
            <CardBody className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-ink-muted">Bookmark (sequence)</span>
                <span className="font-mono tabular-nums text-ink">{bookmark?.lastSequence ?? 0}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-ink-muted">Risk-flag notifications sent</span>
                <span className="font-mono tabular-nums text-ink">{notificationCount}</span>
              </div>
              <p className="text-xs text-ink-faint">
                Notifications are upserted on (event, recipient) — replaying never sends a duplicate. Try &ldquo;Replay
                from start&rdquo; twice in a row and watch the sent count stay the same.
              </p>
            </CardBody>
          </Card>

          <Card>
            <CardHeader eyebrow="Replay controls" title="Run the worker" />
            <CardBody className="space-y-3">
              <form action={processNewEvents}>
                <Button type="submit" variant="primary" className="w-full">
                  <PlayCircle className="size-4" aria-hidden /> Process new events
                </Button>
              </form>
              <form action={replayFromStart}>
                <Button type="submit" variant="secondary" className="w-full">
                  <RotateCcw className="size-4" aria-hidden /> Replay from start
                </Button>
              </form>
              <form action={replayFromTimestamp} className="space-y-2 border-t border-border pt-3">
                <Field label="Replay from timestamp" type="datetime-local" name="since" required />
                <Button type="submit" variant="secondary" className="w-full">
                  Replay from here
                </Button>
              </form>
            </CardBody>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
