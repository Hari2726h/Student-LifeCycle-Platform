import { prisma } from "@/lib/prisma";

export type AtRiskReason = "STALLED" | "DECLINING" | "RISK_FLAG";

const STALLED_DAYS = 90;

/** The "Needs follow-up" dashboard's three criteria, for already-enrolled
 * students: status hasn't moved in 90+ days, the last two academic records
 * show GPA or attendance dropping, or a mentor has an unresolved risk flag
 * open. A student can match more than one — each reason is surfaced, not
 * just the first one found. This is a retention concern, distinct from the
 * admission-time deservingness assessment in lib/deservingness.ts. */
export async function getAtRiskStudents() {
  const stalledCutoff = new Date();
  stalledCutoff.setDate(stalledCutoff.getDate() - STALLED_DAYS);

  const students = await prisma.student.findMany({
    where: { status: { in: ["ONBOARDING", "ACTIVE"] } },
    include: {
      user: true,
      mentor: { include: { user: true } },
      mentorLogs: { where: { isRiskFlag: true, resolvedAt: null }, orderBy: { createdAt: "desc" } },
      academicRecords: { orderBy: { semester: "desc" }, take: 2 },
      followUps: { where: { status: "OPEN" }, include: { assignedTo: true } },
    },
  });

  return students
    .map((s) => {
      const reasons: AtRiskReason[] = [];
      if (s.updatedAt < stalledCutoff) reasons.push("STALLED");

      if (s.academicRecords.length === 2) {
        const [latest, previous] = s.academicRecords;
        if (latest.gpa < previous.gpa || latest.attendancePercent < previous.attendancePercent) {
          reasons.push("DECLINING");
        }
      }

      if (s.mentorLogs.length > 0) reasons.push("RISK_FLAG");

      return { ...s, reasons };
    })
    .filter((s) => s.reasons.length > 0)
    .sort((a, b) => b.reasons.length - a.reasons.length);
}
