import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { appendEvent } from "@/lib/events";
import { verifyEventChain, computeEventHash, GENESIS_HASH } from "@/lib/event-integrity";

let aggregateIds: string[] = [];

afterEach(async () => {
  await prisma.event.deleteMany({ where: { aggregateId: { in: aggregateIds } } });
  aggregateIds = [];
});

function freshAggregateId() {
  const id = `integrity-test-${crypto.randomUUID()}`;
  aggregateIds.push(id);
  return id;
}

describe("event hash chain", () => {
  it("computeEventHash is deterministic regardless of payload key order", () => {
    const occurredAt = new Date("2026-01-01T00:00:00.000Z");
    const a = computeEventHash(GENESIS_HASH, {
      aggregateType: "Test",
      aggregateId: "x",
      type: "T",
      payload: { a: 1, b: 2 },
      occurredAt,
    });
    const b = computeEventHash(GENESIS_HASH, {
      aggregateType: "Test",
      aggregateId: "x",
      type: "T",
      payload: { b: 2, a: 1 }, // same data, different key order — simulates JSONB's own reordering
      occurredAt,
    });
    expect(a).toBe(b);
  });

  it("a freshly appended chain verifies as valid", async () => {
    const aggregateId = freshAggregateId();
    await prisma.$transaction(async (tx) => {
      await appendEvent(tx, { aggregateType: "Test", aggregateId, type: "INTEGRITY_TEST_A", payload: { step: 1 } });
      await appendEvent(tx, { aggregateType: "Test", aggregateId, type: "INTEGRITY_TEST_B", payload: { step: 2 } });
    });

    const result = await verifyEventChain();
    expect(result.valid).toBe(true);
    expect(result.brokenAtSequence).toBeNull();
  });

  it("detects a directly-edited event payload — the exact tampering this feature exists to catch", async () => {
    const aggregateId = freshAggregateId();
    const event = await prisma.$transaction((tx) =>
      appendEvent(tx, { aggregateType: "Test", aggregateId, type: "INTEGRITY_TEST_TAMPER", payload: { amount: 100 } }),
    );

    // Bypasses the app entirely — the same kind of edit a direct DB access
    // (or a compromised admin tool) could make, which appendEvent's
    // transactional guarantee can't prevent on its own.
    await prisma.event.update({ where: { id: event.id }, data: { payload: { amount: 999999 } } });

    const result = await verifyEventChain();
    expect(result.valid).toBe(false);
    expect(result.brokenAtSequence).toBe(event.sequence);
    expect(result.reason).toMatch(/content no longer matches/i);
  });

  it("detects a broken chain link (prevHash pointing at the wrong predecessor)", async () => {
    const aggregateId = freshAggregateId();
    const event = await prisma.$transaction((tx) =>
      appendEvent(tx, { aggregateType: "Test", aggregateId, type: "INTEGRITY_TEST_RELINK", payload: {} }),
    );

    await prisma.event.update({ where: { id: event.id }, data: { prevHash: "0".repeat(64).replace(/^./, "f") } });

    const result = await verifyEventChain();
    expect(result.valid).toBe(false);
    expect(result.brokenAtSequence).toBe(event.sequence);
    expect(result.reason).toMatch(/reordered|inserted/i);
  });
});
