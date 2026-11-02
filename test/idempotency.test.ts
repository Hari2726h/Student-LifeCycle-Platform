import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { checkIdempotencyKey, recordIdempotencyKey } from "@/lib/idempotency";

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

describe("idempotency keys — guards the HTTP boundary, not just the DB state", () => {
  it("a never-seen key is not already processed", async () => {
    const result = await checkIdempotencyKey(freshKey());
    expect(result.seen).toBe(false);
  });

  it("a key recorded once is replayed with its original result on a second check", async () => {
    const key = freshKey();
    let result = await checkIdempotencyKey(key);
    expect(result.seen).toBe(false);

    await recordIdempotencyKey(key, "BULK_SHORTLIST", "Shortlist: updated 3");

    result = await checkIdempotencyKey(key);
    expect(result.seen).toBe(true);
    expect(result.resultMessage).toBe("Shortlist: updated 3");
  });

  it("recording the same key twice (simulated race) does not throw and keeps the first result", async () => {
    const key = freshKey();
    await recordIdempotencyKey(key, "BULK_SELECT", "Select: updated 1");
    // A second, concurrent writer loses the unique-constraint race —
    // recordIdempotencyKey swallows that instead of crashing the request.
    await expect(recordIdempotencyKey(key, "BULK_SELECT", "Select: updated 1 (duplicate attempt)")).resolves.toBeUndefined();

    const rows = await prisma.idempotencyKey.findMany({ where: { key } });
    expect(rows).toHaveLength(1);
    expect(rows[0].resultMessage).toBe("Select: updated 1");
  });

  it("an empty key (no idempotency requested) is never treated as seen", async () => {
    const result = await checkIdempotencyKey("");
    expect(result.seen).toBe(false);
    await recordIdempotencyKey("", "NOOP", "should not persist");
    const rows = await prisma.idempotencyKey.findMany({ where: { key: "" } });
    expect(rows).toHaveLength(0);
  });

  it("two different keys for the same action never collide", async () => {
    const keyA = freshKey();
    const keyB = freshKey();
    await recordIdempotencyKey(keyA, "BULK_REJECT", "Reject: updated 2");
    const resultB = await checkIdempotencyKey(keyB);
    expect(resultB.seen).toBe(false);
  });
});
