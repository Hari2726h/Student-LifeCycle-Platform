import { prisma } from "@/lib/prisma";
import type { Event, Prisma } from "@prisma/client";

/**
 * One person's entire Maatram journey, end to end, built from nothing but
 * replaying their event history — the literal answer to the problem
 * statement's opening line ("one trustworthy record... across their whole
 * journey"). A person accrues events under three different aggregate IDs
 * as they move through the lifecycle (Applicant -> Student -> AlumniProfile),
 * plus mentor check-ins logged against the Student but keyed by their own
 * MentorLog id — this stitches all of it back into one timeline, sorted by
 * the same `sequence` cursor the replay workers use, so "first thing that
 * happened" is never ambiguous.
 */
export async function getPersonTimeline(applicantId: string): Promise<Event[]> {
  const applicant = await prisma.applicant.findUnique({
    where: { id: applicantId },
    select: { id: true, student: { select: { id: true, alumniProfile: { select: { id: true } } } } },
  });
  if (!applicant) return [];

  const directIds = [applicant.id];
  if (applicant.student) directIds.push(applicant.student.id);
  if (applicant.student?.alumniProfile) directIds.push(applicant.student.alumniProfile.id);

  const directEvents = await prisma.event.findMany({
    where: { aggregateId: { in: directIds } },
  });

  // Mentor check-ins/risk flags are logged under their own MentorLog id, not
  // the student's — the link back to this person lives in the payload.
  const mentorEvents = applicant.student
    ? await prisma.event.findMany({
        where: {
          aggregateType: "MentorLog",
          payload: { path: ["studentId"], equals: applicant.student.id } as Prisma.JsonFilter,
        },
      })
    : [];

  return [...directEvents, ...mentorEvents].sort((a, b) => a.sequence - b.sequence);
}

export function describePersonTimelineEvent(type: string, p: Record<string, unknown>): string {
  switch (type) {
    case "APPLICANT_STATUS_CHANGED": {
      const action = p.action ? ` (${String(p.action).replaceAll("_", " ").toLowerCase()})` : "";
      const bulk = p.bulk ? " · bulk action" : "";
      return `Application status: ${p.fromStatus ?? "—"} → ${p.toStatus}${action}${bulk}`;
    }
    case "STUDENT_ONBOARDED":
      return "Onboarded as a student";
    case "STUDENT_STATUS_CHANGED":
      return `Student status: ${p.fromStatus ?? "—"} → ${p.toStatus}`;
    case "MENTOR_LOG_CREATED":
      return "Mentor check-in logged";
    case "RISK_FLAG_LOGGED":
      return "Flagged for follow-up during mentor check-in";
    case "CAREER_EVENT_ADDED": {
      const source = p.source ? ` · ${String(p.source).replaceAll("_", " ").toLowerCase()}` : "";
      return `Career update: ${p.role ?? "role"} at ${p.companyNormalized ?? p.company ?? "a company"}${source}`;
    }
    default:
      return type.replaceAll("_", " ").toLowerCase();
  }
}
