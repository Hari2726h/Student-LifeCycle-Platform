import { prisma } from "@/lib/prisma";
import { appendEvent } from "@/lib/events";
import { normalizeCompanyName } from "@/lib/company-normalize";
import type { CareerEventSource, Prisma } from "@prisma/client";

type AddCareerEventInput = {
  alumniProfileId: string;
  source: CareerEventSource;
  company: string;
  role: string;
  startDate: Date;
  endDate?: Date | null;
  notes?: string;
};

/** Appends one career event and replays the alumnus's full history to
 * recompute their current position — the profile is never edited
 * directly, only ever derived. */
export async function addCareerEvent(input: AddCareerEventInput) {
  const companyNormalized = normalizeCompanyName(input.company);

  return prisma.$transaction(async (tx) => {
    // An open-ended new role succeeds whatever open-ended role preceded it
    // — otherwise two positions could both claim to be "current" forever.
    if (!input.endDate) {
      await tx.careerEvent.updateMany({
        where: { alumniProfileId: input.alumniProfileId, endDate: null },
        data: { endDate: input.startDate },
      });
    }

    const event = await tx.careerEvent.create({
      data: {
        alumniProfileId: input.alumniProfileId,
        source: input.source,
        company: input.company,
        companyNormalized,
        role: input.role,
        startDate: input.startDate,
        endDate: input.endDate ?? null,
        notes: input.notes,
      },
    });

    await appendEvent(tx, {
      aggregateType: "AlumniProfile",
      aggregateId: input.alumniProfileId,
      type: "CAREER_EVENT_ADDED",
      payload: {
        careerEventId: event.id,
        source: input.source,
        company: input.company,
        companyNormalized,
        role: input.role,
        startDate: input.startDate.toISOString(),
      },
    });

    await recomputeProjection(tx, input.alumniProfileId);

    return event;
  });
}

/** Replays one alumnus's full CareerEvent history to derive (a) which
 * event, if any, is their current position, and (b) the cached
 * currentCompany/currentRole shown on their profile. This is the only
 * code path allowed to write those fields. */
export async function recomputeProjection(tx: Prisma.TransactionClient, alumniProfileId: string) {
  const events = await tx.careerEvent.findMany({
    where: { alumniProfileId },
    // A secondary key makes same-day career changes order deterministically
    // — without one, two events sharing a startDate have no guaranteed tie-
    // break, so replaying the same history twice could silently pick a
    // different one as "current" each time.
    orderBy: [{ startDate: "asc" }, { createdAt: "asc" }],
  });

  const now = new Date();
  const ongoing = events.filter((e) => e.startDate <= now && (!e.endDate || e.endDate >= now));
  const current = ongoing.at(-1) ?? null;

  for (const e of events) {
    const isCurrent = e.id === current?.id;
    if (e.isCurrent !== isCurrent) {
      await tx.careerEvent.update({ where: { id: e.id }, data: { isCurrent } });
    }
  }

  await tx.alumniProfile.update({
    where: { id: alumniProfileId },
    data: { currentCompany: current?.company ?? null, currentRole: current?.role ?? null },
  });
}

/** Demo/ops entry point: re-derive every alumnus's profile from scratch.
 * Proves the projection is reproducible from history alone — not a fact
 * that happens to agree with history because nobody re-checks it. */
export async function recomputeAllProfiles() {
  const profiles = await prisma.alumniProfile.findMany({ select: { id: true } });
  for (const p of profiles) {
    await prisma.$transaction((tx) => recomputeProjection(tx, p.id));
  }
  return { recomputed: profiles.length };
}

export async function findAlumniAtCompany(query: string) {
  const normalized = normalizeCompanyName(query);
  const matches = await prisma.careerEvent.findMany({
    where: { companyNormalized: normalized, isCurrent: true },
    include: { alumniProfile: { include: { student: { include: { user: true } } } } },
    orderBy: { startDate: "desc" },
  });
  return matches;
}
