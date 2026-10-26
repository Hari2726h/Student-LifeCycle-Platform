import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { runWorker, resetWorkerBookmark } from "@/lib/workers/engine";
import type { Event } from "@prisma/client";

// A fresh, random aggregate/worker name per test so tests never see each
// other's events — this hits the real local Postgres from docker-compose.
const EVENT_TYPE = "TEST_EVENT";
let workerNames: string[] = [];
let aggregateIds: string[] = [];

afterEach(async () => {
  await prisma.event.deleteMany({ where: { aggregateId: { in: aggregateIds } } });
  await prisma.replayBookmark.deleteMany({ where: { workerName: { in: workerNames } } });
  workerNames = [];
  aggregateIds = [];
});

function freshWorkerName() {
  const name = `test-worker-${crypto.randomUUID()}`;
  workerNames.push(name);
  return name;
}

function freshAggregateId() {
  const id = `test-aggregate-${crypto.randomUUID()}`;
  aggregateIds.push(id);
  return id;
}

async function makeEvent(aggregateId: string, occurredAt: Date) {
  return prisma.event.create({
    data: { aggregateType: "Test", aggregateId, type: EVENT_TYPE, payload: {}, occurredAt },
  });
}

const secondsAgo = (n: number) => new Date(Date.now() - n * 1000);

describe("runWorker (replay engine)", () => {
  it("processes events in sequence order and advances the bookmark", async () => {
    const workerName = freshWorkerName();
    const aggregateId = freshAggregateId();
    const e1 = await makeEvent(aggregateId, secondsAgo(10));
    const e2 = await makeEvent(aggregateId, secondsAgo(9));

    const handled: Event[] = [];
    const result = await runWorker({
      workerName,
      eventTypes: [EVENT_TYPE],
      safetyLagMs: 0,
      handle: async (e) => void handled.push(e),
    });

    expect(result.processed).toBe(2);
    expect(handled.map((e) => e.id)).toEqual([e1.id, e2.id]);
  });

  it("is idempotent — replaying after the bookmark has advanced reprocesses nothing", async () => {
    const workerName = freshWorkerName();
    const aggregateId = freshAggregateId();
    await makeEvent(aggregateId, secondsAgo(10));
    await makeEvent(aggregateId, secondsAgo(9));

    const handle = async () => {};
    await runWorker({ workerName, eventTypes: [EVENT_TYPE], safetyLagMs: 0, handle });

    const handled: Event[] = [];
    const second = await runWorker({
      workerName,
      eventTypes: [EVENT_TYPE],
      safetyLagMs: 0,
      handle: async (e) => void handled.push(e),
    });

    expect(second.processed).toBe(0);
    expect(handled).toEqual([]);

    // Replaying the exact same events a third time is still a no-op.
    const third = await runWorker({ workerName, eventTypes: [EVENT_TYPE], safetyLagMs: 0, handle });
    expect(third.processed).toBe(0);
  });

  it("withholds events still inside the safety-lag window, then picks them up once it passes", async () => {
    // This is the out-of-order guard in miniature: a worker that ran right
    // after an event committed must not treat it as "safe to assume nothing
    // older is still in flight" — that's exactly the race where a
    // lower-sequence, slower transaction could commit after a faster one.
    const workerName = freshWorkerName();
    const aggregateId = freshAggregateId();
    await makeEvent(aggregateId, new Date()); // occurredAt = right now

    const immediate = await runWorker({
      workerName,
      eventTypes: [EVENT_TYPE],
      safetyLagMs: 60_000, // 60s lag — "right now" is nowhere near safe yet
      handle: async () => {},
    });
    expect(immediate.processed).toBe(0);

    // The bookmark must not have advanced just because we looked.
    const bookmark = await prisma.replayBookmark.findUnique({ where: { workerName } });
    expect(bookmark?.lastSequence).toBe(0);

    const later = await runWorker({
      workerName,
      eventTypes: [EVENT_TYPE],
      safetyLagMs: 0, // simulates enough real time having passed
      handle: async () => {},
    });
    expect(later.processed).toBe(1);
  });

  it("never skips an event even if a worker runs between its insert and when it becomes safe", async () => {
    const workerName = freshWorkerName();
    const aggregateId = freshAggregateId();
    const older = await makeEvent(aggregateId, secondsAgo(10));

    // Worker runs once, processes the old event, bookmark advances to it.
    const handled: Event[] = [];
    await runWorker({
      workerName,
      eventTypes: [EVENT_TYPE],
      safetyLagMs: 5000,
      handle: async (e) => void handled.push(e),
    });
    expect(handled.map((e) => e.id)).toEqual([older.id]);

    // A second event lands with a higher sequence but is still "too new".
    const newer = await makeEvent(aggregateId, new Date());
    const duringLag = await runWorker({
      workerName,
      eventTypes: [EVENT_TYPE],
      safetyLagMs: 5000,
      handle: async (e) => void handled.push(e),
    });
    expect(duringLag.processed).toBe(0); // not skipped — just not safe yet

    const afterLag = await runWorker({
      workerName,
      eventTypes: [EVENT_TYPE],
      safetyLagMs: 0,
      handle: async (e) => void handled.push(e),
    });
    expect(afterLag.processed).toBe(1);
    expect(handled.map((e) => e.id)).toEqual([older.id, newer.id]);
  });

  it("resetWorkerBookmark rewinds so the next run replays from that point", async () => {
    const workerName = freshWorkerName();
    const aggregateId = freshAggregateId();
    const e1 = await makeEvent(aggregateId, secondsAgo(10));
    const e2 = await makeEvent(aggregateId, secondsAgo(9));

    await runWorker({ workerName, eventTypes: [EVENT_TYPE], safetyLagMs: 0, handle: async () => {} });

    await resetWorkerBookmark(workerName, 0); // "replay from start"
    const handled: Event[] = [];
    const replayed = await runWorker({
      workerName,
      eventTypes: [EVENT_TYPE],
      safetyLagMs: 0,
      handle: async (e) => void handled.push(e),
    });

    expect(replayed.processed).toBe(2);
    expect(handled.map((e) => e.id)).toEqual([e1.id, e2.id]);
  });

  it("only sees event types it was asked to replay", async () => {
    const workerName = freshWorkerName();
    const aggregateId = freshAggregateId();
    await prisma.event.create({
      data: { aggregateType: "Test", aggregateId, type: "OTHER_EVENT_TYPE", payload: {}, occurredAt: secondsAgo(10) },
    });
    await makeEvent(aggregateId, secondsAgo(10));

    const handled: Event[] = [];
    const result = await runWorker({
      workerName,
      eventTypes: [EVENT_TYPE],
      safetyLagMs: 0,
      handle: async (e) => void handled.push(e),
    });

    expect(result.processed).toBe(1);
    expect(handled.every((e) => e.type === EVENT_TYPE)).toBe(true);
  });
});
