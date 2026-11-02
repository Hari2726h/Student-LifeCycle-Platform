import { describe, it, expect, afterEach, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { deliverWebhookEvent } from "@/lib/webhooks";

// Exercises deliverWebhookEvent directly rather than going through
// runWebhookDispatcher — that worker shares one global ReplayBookmark row
// with the real app, and this is a live dev database, not a disposable
// test DB. Testing the delivery function in isolation proves the same
// idempotency contract without touching that shared cursor.
let subscriptionIds: string[] = [];
let eventIds: string[] = [];

afterEach(async () => {
  await prisma.webhookDelivery.deleteMany({ where: { subscriptionId: { in: subscriptionIds } } });
  await prisma.webhookSubscription.deleteMany({ where: { id: { in: subscriptionIds } } });
  await prisma.event.deleteMany({ where: { id: { in: eventIds } } });
  subscriptionIds = [];
  eventIds = [];
  vi.restoreAllMocks();
});

async function makeSubscription(url: string) {
  const user = await prisma.user.findFirstOrThrow({ where: { role: "STAFF" } });
  const sub = await prisma.webhookSubscription.create({
    data: { url, eventTypes: ["TEST_WEBHOOK_EVENT"], secret: "test-secret", createdById: user.id },
  });
  subscriptionIds.push(sub.id);
  return sub;
}

async function makeEvent() {
  const event = await prisma.event.create({
    data: { aggregateType: "Test", aggregateId: `test-${crypto.randomUUID()}`, type: "TEST_WEBHOOK_EVENT", payload: {} },
  });
  eventIds.push(event.id);
  return event;
}

describe("deliverWebhookEvent", () => {
  it("POSTs the event once and records a successful delivery", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(new Response("ok", { status: 200 }));
    const sub = await makeSubscription("https://subscriber.example/hook");
    const event = await makeEvent();

    await deliverWebhookEvent(sub, event);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(sub.url);
    expect(init?.headers).toMatchObject({ "X-Maatram-Event": "TEST_WEBHOOK_EVENT" });

    const delivery = await prisma.webhookDelivery.findUnique({
      where: { subscriptionId_eventId: { subscriptionId: sub.id, eventId: event.id } },
    });
    expect(delivery?.success).toBe(true);
    expect(delivery?.statusCode).toBe(200);
  });

  it("never sends a second HTTP request for the same (subscription, event) pair", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(new Response("ok", { status: 200 }));
    const sub = await makeSubscription("https://subscriber.example/hook");
    const event = await makeEvent();

    await deliverWebhookEvent(sub, event);
    await deliverWebhookEvent(sub, event);
    await deliverWebhookEvent(sub, event);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const deliveries = await prisma.webhookDelivery.findMany({ where: { subscriptionId: sub.id, eventId: event.id } });
    expect(deliveries).toHaveLength(1);
  });

  it("records a failed delivery (non-2xx) without throwing, and still dedupes on retry", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(new Response("nope", { status: 500 }));
    const sub = await makeSubscription("https://subscriber.example/unreliable");
    const event = await makeEvent();

    await deliverWebhookEvent(sub, event);
    const delivery = await prisma.webhookDelivery.findUnique({
      where: { subscriptionId_eventId: { subscriptionId: sub.id, eventId: event.id } },
    });
    expect(delivery?.success).toBe(false);
    expect(delivery?.statusCode).toBe(500);

    // A failed delivery is still a recorded attempt — retrying doesn't
    // re-fetch, matching the "exactly one attempt per pair" contract.
    await deliverWebhookEvent(sub, event);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("signs the payload with the subscription's own secret (different secrets, different signatures)", async () => {
    const fetchMock = vi.spyOn(global, "fetch").mockResolvedValue(new Response("ok", { status: 200 }));
    const subA = await makeSubscription("https://subscriber.example/a");
    const event = await makeEvent();
    await deliverWebhookEvent(subA, event);
    const sigA = (fetchMock.mock.calls[0][1]?.headers as Record<string, string>)["X-Maatram-Signature"];

    fetchMock.mockClear();
    const subB = await prisma.webhookSubscription.update({ where: { id: subA.id }, data: { secret: "different-secret" } });
    await prisma.webhookDelivery.deleteMany({ where: { subscriptionId: subA.id } }); // clear so delivery isn't skipped
    await deliverWebhookEvent(subB, event);
    const sigB = (fetchMock.mock.calls[0][1]?.headers as Record<string, string>)["X-Maatram-Signature"];

    expect(sigA).not.toEqual(sigB);
  });
});
