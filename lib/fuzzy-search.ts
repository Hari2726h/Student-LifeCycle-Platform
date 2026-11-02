import { prisma } from "@/lib/prisma";

// Below this, pg_trgm's similarity() treats two strings as unrelated —
// tuned so a couple of typos still match ("Anbarasu" vs "Anbarsau") but
// an unrelated name doesn't.
const SIMILARITY_THRESHOLD = 0.25;

export type ApplicantNameMatch = {
  id: string;
  fullName: string;
  district: string;
  status: string;
  similarity: number;
};

/** Typo-tolerant name search for the staff pipeline — "Anbarsau" still
 * finds "Anbarasu". Falls back to this only when the caller wants fuzzy
 * matching explicitly; exact filters (district/college/status) stay as
 * plain equality queries since those have no typo problem to solve. */
export async function fuzzySearchApplicantsByName(query: string, limit = 25): Promise<ApplicantNameMatch[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  return prisma.$queryRaw<ApplicantNameMatch[]>`
    SELECT id, "fullName", district, status, similarity("fullName", ${trimmed}) AS similarity
    FROM "Applicant"
    WHERE similarity("fullName", ${trimmed}) > ${SIMILARITY_THRESHOLD}
    ORDER BY similarity DESC
    LIMIT ${limit}
  `;
}

export type CompanyMatch = {
  companyNormalized: string;
  company: string;
  similarity: number;
};

/** "Did you mean…" fallback for the alumni company search: the primary
 * lookup in lib/alumni-career.ts is exact-match on the deterministically
 * normalized name (so results are predictable and explainable); this is
 * only reached when that returns nothing, to catch typos the suffix/alias
 * rules don't — e.g. "Zohho" for "Zoho". */
export async function fuzzySearchCompanies(query: string, limit = 5): Promise<CompanyMatch[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];

  return prisma.$queryRaw<CompanyMatch[]>`
    SELECT DISTINCT ON ("companyNormalized") "companyNormalized", company, similarity(company, ${trimmed}) AS similarity
    FROM "CareerEvent"
    WHERE similarity(company, ${trimmed}) > ${SIMILARITY_THRESHOLD} AND "isCurrent" = true
    ORDER BY "companyNormalized", similarity DESC
    LIMIT ${limit}
  `;
}
