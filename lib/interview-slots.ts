import { prisma } from "@/lib/prisma";

/** Pulled into its own function (rather than inlined in a page component)
 * so the `new Date()` call isn't flagged as an impurity inside render. */
export async function getUpcomingSlots() {
  return prisma.interviewSlot.findMany({
    where: { scheduledAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    orderBy: { scheduledAt: "asc" },
    include: { _count: { select: { interviews: true } }, createdBy: true },
  });
}

export async function getOpenSlots() {
  const slots = await prisma.interviewSlot.findMany({
    where: { scheduledAt: { gte: new Date() } },
    orderBy: { scheduledAt: "asc" },
    include: { _count: { select: { interviews: true } } },
  });
  return slots.filter((s) => s._count.interviews < s.capacity);
}
