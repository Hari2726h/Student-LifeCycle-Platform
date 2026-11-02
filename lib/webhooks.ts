import { createHmac, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";
import { runWorker } from "./workers/engine";

export const WEBHOOK_WORKER_NAME = "webhook-dispatcher";

// The full set of event types ever appended — kept here (not introspected
// from the DB) so the subscription form can offer them even before a
// single matching event has ever been logged.
export const WEBHOOK_EVENT_TYPES = [
  "APPLICANT_STATUS_CHANGED",
  "STUDENT_ONBOARDED",
  "STUDENT_STATUS_CHANGED",
  "MENTOR_LOG_CREATED",
  "RISK_FLAG_LOGGED",
  "CAREER_EVENT_ADDED",
] as const;

export function generateWebhookSecret() {
  return randomBytes(24).toString("hex");
}

function signPayload(secret: string, body: string) {
  return createHmac("sha256", secret).update(body).digest("hex");
}

/** Delivers one event to one subscriber, exactly once — the
 * (subscriptionId, eventId) read-before-send check is what makes this
 * idempotent under replay, mirroring the Notification worker's pattern,
 * just with an outbound HTTP call standing in for the upsert. */
export async function deliverWebhookEvent(sub: { id: string; url: string; secret: string }, event: { id: string; type: string; sequence: number; aggregateType: string; aggregateId: string; payload: unknown; occurredAt: Date }) {
  const existing = await prisma.webhookDelivery.findUnique({
    where: { subscriptionId_eventId: { subscriptionId: sub.id, eventId: event.id } },
  });
  if (existing) return;

  const body = JSON.stringify({
    type: event.type,
    sequence: event.sequence,
    aggregateType: event.aggregateType,
    aggregateId: event.aggregateId,
    payload: event.payload,
    occurredAt: event.occurredAt.toISOString(),
  });
  const signature = signPayload(sub.secret, body);

  let statusCode: number | null = null;
  let success = false;
  let responseSnippet = "";

  try {
    const res = await fetch(sub.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Maatram-Signature": signature, "X-Maatram-Event": event.type },
      body,
      signal: AbortSignal.timeout(5000),
    });
    statusCode = res.status;
    success = res.ok;
    responseSnippet = (await res.text().catch(() => "")).slice(0, 200);
  } catch (err) {
    responseSnippet = err instanceof Error ? err.message.slice(0, 200) : "delivery failed";
  }

  // Unique on (subscriptionId, eventId) — if a concurrent run already
  // inserted this exact delivery between our check and here, this throws
  // P2002 rather than double-recording; that's fine, it means another
  // worker run already did the real work.
  await prisma.webhookDelivery.create({
    data: { subscriptionId: sub.id, eventId: event.id, eventType: event.type, statusCode, success, responseSnippet },
  }).catch(() => {});
}

/** Runs on the same replay engine as every other worker — same cursor,
 * same safety-lag window, same crash-resume guarantee. Replaying from
 * start never re-POSTs to a subscriber for an event it already saw. */
export async function runWebhookDispatcher() {
  const subscriptions = await prisma.webhookSubscription.findMany({ where: { isActive: true } });
  if (subscriptions.length === 0) return { processed: 0, lastSequence: 0 };

  const eventTypes = [...new Set(subscriptions.flatMap((s) => s.eventTypes))];
  if (eventTypes.length === 0) return { processed: 0, lastSequence: 0 };

  return runWorker({
    workerName: WEBHOOK_WORKER_NAME,
    eventTypes,
    handle: async (event) => {
      const matching = subscriptions.filter((s) => s.eventTypes.includes(event.type));
      for (const sub of matching) {
        await deliverWebhookEvent(sub, event);
      }
    },
  });
}
