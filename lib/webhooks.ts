import { createHmac, randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { runWorker } from "./workers/engine";
import { assertSafeWebhookUrl } from "@/lib/ssrf-guard";

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
    // Re-checked on every delivery, not just at subscription creation —
    // closes the DNS-rebinding gap (a hostname that resolved to a public
    // IP when the subscription was created could resolve internally by
    // the time this actually runs). See lib/ssrf-guard.ts.
    await assertSafeWebhookUrl(sub.url);
    const res = await fetch(sub.url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Maatram-Signature": signature, "X-Maatram-Event": event.type },
      body,
      redirect: "manual", // never follow a redirect to an internal address
      signal: AbortSignal.timeout(5000),
    });
    statusCode = res.status;
    success = res.ok;
    responseSnippet = (await res.text().catch(() => "")).slice(0, 200);
  } catch (err) {
    responseSnippet = err instanceof Error ? err.message.slice(0, 200) : "delivery failed";
  }

  try {
    // Unique on (subscriptionId, eventId) — if a concurrent run already
    // inserted this exact delivery between our check and here, this
    // throws P2002 rather than double-recording; that's fine, it means
    // another worker run already did the real work.
    await prisma.webhookDelivery.create({
      data: { subscriptionId: sub.id, eventId: event.id, eventType: event.type, statusCode, success, responseSnippet },
    });
  } catch (err) {
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") return;
    // Anything else (a transient connection drop, a schema issue) means
    // the fetch above already happened but we failed to record that it
    // did — swallowing this silently would let the next run re-deliver
    // the same event, contradicting "delivers... exactly once". Logging
    // it at least makes that duplicate-delivery risk visible instead of
    // invisible.
    console.error(`[webhooks] Failed to record delivery for subscription ${sub.id}, event ${event.id}:`, err);
  }
}

/** One bookmark per subscription, not one shared bookmark for the whole
 * dispatcher. A single shared cursor over the dynamic union of every
 * active subscription's event types has a real bug: the cursor advances
 * past whatever that union was *at the time each run happened* — so an
 * event type that wasn't part of the union yet (because its only
 * subscriber didn't exist, or was paused) can get skipped over by an
 * earlier run for a *different* subscriber, and is then unreachable
 * forever once a new subscription for that type is created, because the
 * shared cursor has already moved past its sequence number. Giving each
 * subscription its own bookmark means a brand-new subscription always
 * starts at sequence 0 for its own event types and sees every matching
 * event that was ever logged, regardless of what any other subscriber's
 * cursor has already done. */
export function webhookBookmarkName(subscriptionId: string) {
  return `${WEBHOOK_WORKER_NAME}:${subscriptionId}`;
}

/** Runs on the same replay engine as every other worker — same cursor,
 * same safety-lag window, same crash-resume guarantee — just once per
 * subscription instead of once for the whole dispatcher. Replaying from
 * start never re-POSTs to a subscriber for an event it already saw. */
export async function runWebhookDispatcher() {
  const subscriptions = await prisma.webhookSubscription.findMany({ where: { isActive: true } });

  let totalProcessed = 0;
  let maxLastSequence = 0;
  for (const sub of subscriptions) {
    if (sub.eventTypes.length === 0) continue;
    const result = await runWorker({
      workerName: webhookBookmarkName(sub.id),
      eventTypes: sub.eventTypes,
      handle: (event) => deliverWebhookEvent(sub, event),
    });
    totalProcessed += result.processed;
    maxLastSequence = Math.max(maxLastSequence, result.lastSequence);
  }
  return { processed: totalProcessed, lastSequence: maxLastSequence };
}
