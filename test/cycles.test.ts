import { describe, it, expect, afterEach } from "vitest";
import { prisma } from "@/lib/prisma";
import { getOpenCycle, isCycleOpen } from "@/lib/cycles";

let cycleIds: string[] = [];

afterEach(async () => {
  await prisma.admissionCycle.deleteMany({ where: { id: { in: cycleIds } } });
  cycleIds = [];
});

async function makeCycle(year: number, opensAt: Date, closesAt: Date) {
  const cycle = await prisma.admissionCycle.create({ data: { year, opensAt, closesAt } });
  cycleIds.push(cycle.id);
  return cycle;
}

const daysFromNow = (n: number) => new Date(Date.now() + n * 24 * 60 * 60 * 1000);

describe("cycle gating", () => {
  it("getOpenCycle finds a cycle whose window covers right now", async () => {
    const cycle = await makeCycle(2099, daysFromNow(-10), daysFromNow(10));
    const open = await getOpenCycle();
    expect(open?.id).toBe(cycle.id);
  });

  it("a closed-in-the-past or not-yet-open cycle never counts as open", async () => {
    // The seed data may already have a genuinely open cycle for "now" — this
    // only asserts that neither of these two additions is ever returned.
    const past = await makeCycle(2098, daysFromNow(-100), daysFromNow(-50));
    const future = await makeCycle(2100, daysFromNow(50), daysFromNow(100));
    const open = await getOpenCycle();
    expect(open?.id).not.toBe(past.id);
    expect(open?.id).not.toBe(future.id);
  });

  it("getOpenCycle picks the latest year when multiple windows somehow overlap", async () => {
    await makeCycle(2097, daysFromNow(-10), daysFromNow(10));
    const newer = await makeCycle(2098, daysFromNow(-10), daysFromNow(10));
    const open = await getOpenCycle();
    expect(open?.id).toBe(newer.id);
  });

  it("isCycleOpen is true for a legacy applicant with no cycle assigned", async () => {
    expect(await isCycleOpen(null)).toBe(true);
  });

  it("isCycleOpen reflects the specific cycle's own window, not just whether any cycle is open", async () => {
    const closed = await makeCycle(2096, daysFromNow(-100), daysFromNow(-50));
    const open = await makeCycle(2097, daysFromNow(-10), daysFromNow(10));
    expect(await isCycleOpen(closed.id)).toBe(false);
    expect(await isCycleOpen(open.id)).toBe(true);
  });

  it("isCycleOpen is true for a cycle id that no longer exists (never blocks on a data anomaly)", async () => {
    expect(await isCycleOpen("nonexistent-cycle-id")).toBe(true);
  });
});
