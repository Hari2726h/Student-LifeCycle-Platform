import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { claimIdempotencyKey, finalizeIdempotencyKey } from "@/lib/idempotency";

let keys: string[] = [];

afterEach(async () => {
  await prisma.idempotencyKey.deleteMany({ where: { key: { in: keys } } });
  keys = [];
});

function freshKey() {
  const key = crypto.randomUUID();
  keys.push(key);
  return key;
}

describe("idempotency keys — claim-first, so concurrent duplicates can't both run", () => {
  it("a never-seen key claims successfully", async () => {
    const result = await claimIdempotencyKey(freshKey(), "BULK_SHORTLIST");
    expect(result.claimed).toBe(true);
  });

  it("a finalized key is replayed with its stored result on a second claim attempt", async () => {
    const key = freshKey();
    const first = await claimIdempotencyKey(key, "BULK_SHORTLIST");
    expect(first.claimed).toBe(true);
    await finalizeIdempotencyKey(key, "Shortlist: updated 3");

    const second = await claimIdempotencyKey(key, "BULK_SHORTLIST");
    expect(second.claimed).toBe(false);
    if (!second.claimed) expect(second.resultMessage).toBe("Shortlist: updated 3");
  });

  it("two concurrent claims for the same key — only one wins, the other never runs the transition", async () => {
    const key = freshKey();
    const [a, b] = await Promise.all([claimIdempotencyKey(key, "BULK_SELECT"), claimIdempotencyKey(key, "BULK_SELECT")]);
    const claimedCount = [a, b].filter((r) => r.claimed).length;
    expect(claimedCount).toBe(1);

    const rows = await prisma.idempotencyKey.findMany({ where: { key } });
    expect(rows).toHaveLength(1);
  });

  it("the losing claimant sees a sensible message even before the winner has finalized", async () => {
    const key = freshKey();
    await claimIdempotencyKey(key, "BULK_REJECT");
    const loser = await claimIdempotencyKey(key, "BULK_REJECT");
    expect(loser.claimed).toBe(false);
    if (!loser.claimed) expect(loser.resultMessage).toMatch(/still being processed/i);
  });

  it("an empty key (no idempotency requested) always claims and never persists", async () => {
    const result = await claimIdempotencyKey("", "NOOP");
    expect(result.claimed).toBe(true);
    await finalizeIdempotencyKey("", "should not persist");
    const rows = await prisma.idempotencyKey.findMany({ where: { key: "" } });
    expect(rows).toHaveLength(0);
  });

  it("two different keys for the same action never collide", async () => {
    const keyA = freshKey();
    const keyB = freshKey();
    await claimIdempotencyKey(keyA, "BULK_REJECT");
    const resultB = await claimIdempotencyKey(keyB, "BULK_REJECT");
    expect(resultB.claimed).toBe(true);
  });
});
