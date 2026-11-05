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

/** The actual work, parameterized on an existing transaction — exported
 * so a caller that already has its own transaction open (promoteToAlumnus,
 * which creates the AlumniProfile row this needs to already be visible)
 * can run this as part of that same transaction instead of a second,
 * separate one. The previous design always opened its own transaction
 * here, which forced callers that create the AlumniProfile and the first
 * CareerEvent together to do it as two non-atomic steps — a failure
 * between them left a student permanently promoted to ALUMNI with a
 * Placement record but no CareerEvent/projection at all. */
export async function addCareerEventTx(tx: Prisma.TransactionClient, input: AddCareerEventInput) {
  const companyNormalized = normalizeCompanyName(input.company);

  // An open-ended new role succeeds whatever open-ended role preceded it —
  // otherwise two positions could both claim to be "current" forever.
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
}

/** Appends one career event and replays the alumnus's full history to
 * recompute their current position — the profile is never edited
 * directly, only ever derived. Opens its own transaction; see
 * addCareerEventTx above for the variant that joins an existing one. */
export async function addCareerEvent(input: AddCareerEventInput) {
  return prisma.$transaction((tx) => addCareerEventTx(tx, input));
}

/** Replays one alumnus's full CareerEvent history to derive (a) which
 * event, if any, is their current position, and (b) the cached
 * currentCompany/currentRole shown on their profile. This is the only
 * code path allowed to write those fields. */
export async function recomputeProjection(tx: Prisma.TransactionClient, alumniProfileId: string) {
  const events = await tx.careerEvent.findMany({
    where: { alumniProfileId },
    // A secondary (and tertiary) key makes same-day career changes order
    // deterministically — two events sharing a startDate fall back to
    // createdAt, but rows created in the same transaction (or just the
    // same millisecond) can share that too, with no third tiebreaker.
    // `id` is the final, always-unique tiebreaker, so replaying the same
    // history twice can never silently pick a different event as
    // "current" depending on what order Postgres happens to return ties in.
    orderBy: [{ startDate: "asc" }, { createdAt: "asc" }, { id: "asc" }],
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
