import { prisma } from "@/lib/prisma";

/** The cycle a brand-new application should be filed under — the one
 * whose window is open right now. Returns null if none is (no new drafts
 * can start, but already-started ones are untouched). */
export async function getOpenCycle() {
  const now = new Date();
  return prisma.admissionCycle.findFirst({
    where: { opensAt: { lte: now }, closesAt: { gte: now } },
    orderBy: { year: "desc" },
  });
}

export async function isCycleOpen(cycleId: string | null) {
  if (!cycleId) return true; // legacy applicants with no cycle aren't gated
  const now = new Date();
  const cycle = await prisma.admissionCycle.findUnique({ where: { id: cycleId } });
  if (!cycle) return true;
  return cycle.opensAt <= now && cycle.closesAt >= now;
}

/** Year-over-year numbers for /staff/cycles: funnel counts per cycle plus
 * a placement rate among whoever was actually accepted. */
export async function getCycleStats() {
  const cycles = await prisma.admissionCycle.findMany({ orderBy: { year: "desc" } });

  return Promise.all(
    cycles.map(async (cycle) => {
      const applicants = await prisma.applicant.findMany({
        where: { cycleId: cycle.id },
        select: { status: true, student: { select: { status: true } } },
      });

      const counts: Record<string, number> = {};
      for (const a of applicants) counts[a.status] = (counts[a.status] ?? 0) + 1;

      const acceptedOrLater = applicants.filter((a) => a.status === "ACCEPTED" || a.student);
      const placedOrAlumni = applicants.filter((a) => a.student && ["PLACED", "ALUMNI"].includes(a.student.status));
      const placementRate =
        acceptedOrLater.length > 0 ? Math.round((placedOrAlumni.length / acceptedOrLater.length) * 100) : null;

      return { cycle, total: applicants.length, counts, accepted: acceptedOrLater.length, placementRate };
    }),
  );
}
