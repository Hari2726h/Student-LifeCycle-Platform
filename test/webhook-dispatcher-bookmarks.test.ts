import { describe, it, expect, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { runWebhookDispatcher, webhookBookmarkName } from "@/lib/webhooks";

// Reproduces the exact bug this per-subscription bookmark design fixes: a
// single shared cursor over the dynamic union of every active
// subscription's event types permanently skips events for a type whose
// only subscriber didn't exist yet when an earlier run advanced the
// shared cursor past that event's sequence number.
let subscriptionIds: string[] = [];
let eventIds: string[] = [];

afterEach(async () => {
  const bookmarkNames = subscriptionIds.map(webhookBookmarkName);
  await prisma.webhookDelivery.deleteMany({ where: { subscriptionId: { in: subscriptionIds } } });
  await prisma.webhookSubscription.deleteMany({ where: { id: { in: subscriptionIds } } });
  await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
  await prisma.replayBookmark.deleteMany({ where: { workerName: { in: bookmarkNames } } });
  subscriptionIds = [];
  eventIds = [];
  vi.restoreAllMocks();
});

async function makeSubscription(eventTypes: string[]) {
  const user = await prisma.user.findFirstOrThrow({ where: { role: "STAFF" } });
  const sub = await prisma.webhookSubscription.create({
    data: { url: "https://93.184.216.34/hook", eventTypes, secret: "test-secret", createdById: user.id },
  });
  subscriptionIds.push(sub.id);
  return sub;
}

async function makeOldEvent(type: string) {
  // Old enough to clear runWorker's default 15s safety lag immediately.
  const event = await prisma.event.create({
    data: {
      aggregateType: "Test",
      aggregateId: `test-${crypto.randomUUID()}`,
      type,
      payload: {},
      occurredAt: new Date(Date.now() - 20_000),
      hash: `test-hash-${crypto.randomUUID()}`,
      prevHash: "test-prev-hash",
    },
  });
  eventIds.push(event.id);
  return event;
}

describe("runWebhookDispatcher — per-subscription bookmarks", () => {
  it("a newly created subscription sees an older event that an earlier subscriber's run never queried for", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("ok", { status: 200 }));

    const subA = await makeSubscription(["TEST_BOOKMARK_A"]);
    const olderEvent = await makeOldEvent("TEST_BOOKMARK_OTHER"); // subA never subscribes to this type
    const newerEvent = await makeOldEvent("TEST_BOOKMARK_A");

    // subA's run only ever queries TEST_BOOKMARK_A — it advances its own
    // bookmark past newerEvent's (higher) sequence without ever looking at
    // olderEvent's (lower) sequence at all.
    await runWebhookDispatcher();
    const deliveredToA = await prisma.webhookDelivery.findUnique({
      where: { subscriptionId_eventId: { subscriptionId: subA.id, eventId: newerEvent.id } },
    });
    expect(deliveredToA?.success).toBe(true);

    // Now a brand-new subscriber for the older event's type shows up —
    // with a shared global cursor, the bug is that it would never see
    // olderEvent because the cursor had already moved past its sequence
    // number while processing subA's run above.
    const subB = await makeSubscription(["TEST_BOOKMARK_OTHER"]);
    await runWebhookDispatcher();

    const deliveredToB = await prisma.webhookDelivery.findUnique({
      where: { subscriptionId_eventId: { subscriptionId: subB.id, eventId: olderEvent.id } },
    });
    expect(deliveredToB?.success).toBe(true);
  });

  it("pausing and reactivating one subscription doesn't affect another subscription's own cursor", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue(new Response("ok", { status: 200 }));

    const subA = await makeSubscription(["TEST_BOOKMARK_PAUSE_A"]);
    const subB = await makeSubscription(["TEST_BOOKMARK_PAUSE_B"]);
    const eventForA = await makeOldEvent("TEST_BOOKMARK_PAUSE_A");
    const eventForB = await makeOldEvent("TEST_BOOKMARK_PAUSE_B");

    await prisma.webhookSubscription.update({ where: { id: subA.id }, data: { isActive: false } });
    await runWebhookDispatcher(); // only B is active this run

    const bDelivery = await prisma.webhookDelivery.findUnique({
      where: { subscriptionId_eventId: { subscriptionId: subB.id, eventId: eventForB.id } },
    });
    expect(bDelivery?.success).toBe(true);

    await prisma.webhookSubscription.update({ where: { id: subA.id }, data: { isActive: true } });
    await runWebhookDispatcher();

    const aDelivery = await prisma.webhookDelivery.findUnique({
      where: { subscriptionId_eventId: { subscriptionId: subA.id, eventId: eventForA.id } },
    });
    expect(aDelivery?.success).toBe(true);
  });
});
