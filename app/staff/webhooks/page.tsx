import { Webhook, PlayCircle, RotateCcw, Trash2 } from "lucide-react";
import { requireRole } from "@/lib/auth-helpers";
import { prisma } from "@/lib/prisma";
import { getStaffNav } from "@/lib/staff-nav";
import { WEBHOOK_EVENT_TYPES } from "@/lib/webhooks";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader, CardBody } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Field } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Table, Thead, Th, Tr, Td, TableScroll } from "@/components/ui/table";
import { EmptyState } from "@/components/ui/empty-state";
import {
  createSubscription,
  toggleSubscription,
  deleteSubscription,
  runDispatcherNow,
  replayWebhooksFromStart,
} from "./actions";

export default async function WebhooksPage({
  searchParams,
}: {
  searchParams: Promise<{ result?: string; error?: string }>;
}) {
  const session = await requireRole(["STAFF"]);
  const { result, error } = await searchParams;
  const nav = await getStaffNav("STAFF", session.user.id);

  const subscriptions = await prisma.webhookSubscription.findMany({
    orderBy: { createdAt: "desc" },
    include: { deliveries: { orderBy: { attemptedAt: "desc" }, take: 5 } },
  });

  return (
    <AppShell role="STAFF" name={session.user.name ?? "Staff"} nav={nav}>
      <PageHeader
        eyebrow="Integrations"
        title="Webhook subscribers"
        description="External systems subscribe to event types and get an HTTP POST per matching event — dispatched off the same replay engine as every internal worker, so replaying never double-sends."
      />

      {result && <div className="mb-4 rounded-md border border-success/30 bg-success-soft/50 px-3 py-2 text-sm text-success">{decodeURIComponent(result)}</div>}
      {error && <p className="mb-4 text-sm text-danger">{decodeURIComponent(error)}</p>}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="space-y-5 lg:col-span-2">
          {subscriptions.length === 0 ? (
            <Card>
              <div className="p-5">
                <EmptyState icon={Webhook} title="No webhook subscriptions yet" />
              </div>
            </Card>
          ) : (
            subscriptions.map((sub) => (
              <Card key={sub.id}>
                <CardHeader
                  eyebrow={sub.isActive ? "Active" : "Paused"}
                  title={sub.url}
                  action={
                    <div className="flex gap-1.5">
                      <form action={toggleSubscription.bind(null, sub.id)}>
                        <input type="hidden" name="isActive" value={String(sub.isActive)} />
                        <Button type="submit" variant="secondary" size="sm">
                          {sub.isActive ? "Pause" : "Resume"}
                        </Button>
                      </form>
                      <form action={deleteSubscription.bind(null, sub.id)}>
                        <Button type="submit" variant="danger" size="sm">
                          <Trash2 className="size-3.5" aria-hidden />
                        </Button>
                      </form>
                    </div>
                  }
                />
                <CardBody className="space-y-3">
                  <div className="flex flex-wrap gap-1.5">
                    {sub.eventTypes.map((t) => (
                      <Badge key={t} tone="neutral">
                        {t}
                      </Badge>
                    ))}
                  </div>
                  <p className="text-xs text-ink-faint">
                    Secret: <span className="font-mono">{sub.secret.slice(0, 12)}…</span> — signs every delivery as{" "}
                    <span className="font-mono">X-Maatram-Signature</span> (HMAC-SHA256 of the raw body).
                  </p>
                  <div>
                    <p className="mb-1.5 text-xs font-medium text-ink-muted">Last 5 deliveries</p>
                    {sub.deliveries.length === 0 ? (
                      <p className="text-xs text-ink-faint">No deliveries yet — run the dispatcher.</p>
                    ) : (
                      <TableScroll>
                        <Table>
                          <Thead>
                            <tr>
                              <Th>Event</Th>
                              <Th>Status</Th>
                              <Th>Response</Th>
                              <Th>When</Th>
                            </tr>
                          </Thead>
                          <tbody>
                            {sub.deliveries.map((d) => (
                              <Tr key={d.id}>
                                <Td className="font-mono text-xs">{d.eventType}</Td>
                                <Td>
                                  <Badge tone={d.success ? "success" : "danger"}>{d.statusCode ?? "failed"}</Badge>
                                </Td>
                                <Td className="max-w-[220px] truncate text-xs text-ink-faint">{d.responseSnippet || "—"}</Td>
                                <Td className="text-xs text-ink-faint">{d.attemptedAt.toLocaleString()}</Td>
                              </Tr>
                            ))}
                          </tbody>
                        </Table>
                      </TableScroll>
                    )}
                  </div>
                </CardBody>
              </Card>
            ))
          )}
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader eyebrow="New" title="Add a subscription" action={<Webhook className="size-4 text-ink-faint" aria-hidden />} />
            <CardBody>
              <form action={createSubscription} className="space-y-3">
                <Field label="Target URL" name="url" placeholder="https://example.com/hooks/maatram" required />
                <p className="-mt-2 text-xs text-ink-faint">
                  No external server handy? Use <span className="font-mono">/api/webhooks/test-receiver</span> on this
                  same origin — it logs and acknowledges every delivery.
                </p>
                <fieldset className="space-y-1.5">
                  <legend className="text-xs font-medium text-ink-muted">Event types</legend>
                  {WEBHOOK_EVENT_TYPES.map((t) => (
                    <label key={t} className="flex items-center gap-2 text-sm text-ink">
                      <input type="checkbox" name="eventTypes" value={t} className="size-4 rounded border-border accent-accent" />
                      <span className="font-mono text-xs">{t}</span>
                    </label>
                  ))}
                </fieldset>
                <Button type="submit" variant="primary" className="w-full">
                  Create subscription
                </Button>
              </form>
            </CardBody>
          </Card>

          <Card>
            <CardHeader eyebrow="Dispatch" title="Run the dispatcher" />
            <CardBody className="space-y-3">
              <form action={runDispatcherNow}>
                <Button type="submit" variant="primary" className="w-full">
                  <PlayCircle className="size-4" aria-hidden /> Dispatch new events
                </Button>
              </form>
              <form action={replayWebhooksFromStart}>
                <Button type="submit" variant="secondary" className="w-full">
                  <RotateCcw className="size-4" aria-hidden /> Replay from start
                </Button>
              </form>
              <p className="text-xs text-ink-faint">
                Each delivery is keyed on (subscription, event) — replaying from start re-walks every event but never
                re-POSTs one already delivered to the same subscriber.
              </p>
            </CardBody>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
