import { prisma } from "@/lib/prisma";

/** Crude but explainable: buckets a course name into the same broad
 * specialty categories mentors are tagged with. Good enough to rank
 * suggestions; staff still makes the final call. */
function courseToSpecialty(course: string): string {
  const engineering = /^B\.?\s?(E|Tech)\.?/i;
  if (engineering.test(course)) return "Engineering";
  if (/medic/i.test(course)) return "Medical";
  return "Arts & Science";
}

export type MentorSuggestion = {
  mentorId: string;
  name: string;
  type: "STAFF" | "ALUMNI";
  specialty: string | null;
  district: string | null;
  load: number;
  maxLoad: number;
  score: number;
  reasons: string[];
};

/** Rule-based scoring on specialty overlap, geographic proximity, and
 * current load — surfaces a ranked list. Mentors already at capacity are
 * excluded outright rather than merely penalized. Staff makes the final
 * call with one click; this never auto-assigns. */
export async function suggestMentors(applicantId: string): Promise<MentorSuggestion[]> {
  const applicant = await prisma.applicant.findUniqueOrThrow({ where: { id: applicantId } });
  const targetSpecialty = applicant.courseInterest ? courseToSpecialty(applicant.courseInterest) : null;

  const mentors = await prisma.mentor.findMany({
    include: { user: true, _count: { select: { mentees: true } } },
  });

  const scored = mentors
    .map((m) => {
      const load = m._count.mentees;
      const reasons: string[] = [];
      let score = 0;

      if (targetSpecialty && m.specialty === targetSpecialty) {
        score += 3;
        reasons.push(`Specialty match: ${m.specialty}`);
      }
      if (m.district && m.district === applicant.district) {
        score += 2;
        reasons.push(`Same district: ${m.district}`);
      }
      if (load < m.maxLoad * 0.5) {
        score += 2;
        reasons.push(`Light caseload (${load}/${m.maxLoad})`);
      } else if (load < m.maxLoad) {
        score += 1;
        reasons.push(`Has capacity (${load}/${m.maxLoad})`);
      }

      return {
        mentorId: m.id,
        name: m.user.name,
        type: m.type,
        specialty: m.specialty,
        district: m.district,
        load,
        maxLoad: m.maxLoad,
        score,
        reasons,
      };
    })
    .filter((m) => m.load < m.maxLoad)
    .sort((a, b) => b.score - a.score);

  return scored.slice(0, 5);
}
