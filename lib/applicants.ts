import { prisma } from "@/lib/prisma";

/** Plain Levenshtein distance — good enough for catching typo'd re-entries
 * of the same name without pulling in a fuzzy-matching dependency. */
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j - 1], dp[i - 1][j], dp[i][j - 1]);
    }
  }
  return dp[m][n];
}

function normalize(name: string) {
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Flags likely re-applications before a volunteer wastes a field visit:
 * an exact phone match, or a same-DOB applicant with a near-identical name. */
export async function findPossibleDuplicates(applicantId: string) {
  const applicant = await prisma.applicant.findUniqueOrThrow({ where: { id: applicantId } });

  const candidates = await prisma.applicant.findMany({
    where: {
      id: { not: applicantId },
      status: { not: "DRAFT" },
      OR: [{ phone: applicant.phone }, { dob: applicant.dob }],
    },
    select: { id: true, fullName: true, phone: true, dob: true, district: true, status: true, createdAt: true },
  });

  const normalizedName = normalize(applicant.fullName);

  return candidates.filter((c) => {
    if (c.phone === applicant.phone) return true;
    if (c.dob.getTime() !== applicant.dob.getTime()) return false;
    return levenshtein(normalizedName, normalize(c.fullName)) <= 2;
  });
}

/** Geo-assignment: prefer a volunteer whose home district matches the
 * applicant's, tie-broken by whoever currently has the lightest
 * verification queue. Falls back to the lightest overall load if nobody
 * covers that district, and to no assignment if there are no volunteers
 * in the system yet. */
export async function assignVolunteer(district: string) {
  const volunteers = await prisma.user.findMany({
    where: { role: "VOLUNTEER", isActive: true },
    select: {
      id: true,
      district: true,
      _count: { select: { volunteerAssignments: { where: { status: "UNDER_VERIFICATION" } } } },
    },
  });

  if (volunteers.length === 0) return null;

  const scored = volunteers
    .map((v) => ({ id: v.id, inDistrict: v.district === district, load: v._count.volunteerAssignments }))
    .sort((a, b) => {
      if (a.inDistrict !== b.inDistrict) return a.inDistrict ? -1 : 1;
      return a.load - b.load;
    });

  return scored[0].id;
}
