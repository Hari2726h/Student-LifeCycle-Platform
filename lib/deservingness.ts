import type { FamilySituation, Gender } from "@prisma/client";

export type DeservingnessReason = { factor: string; weight: number };

export type DeservingnessResult = {
  score: number; // 0–100, higher = stronger priority for a sponsored seat
  tier: "HIGH_PRIORITY" | "STANDARD" | "REVIEW_RECOMMENDED";
  reasons: DeservingnessReason[];
};

type ScoreInput = {
  boardPercentage: number | null;
  gender: Gender;
  familySituation: FamilySituation | null;
  annualIncomeInr: number | null;
  householdSize: number | null;
  interviewScores: { financialNeed: number; intentClarity: number; communication: number }[];
};

/**
 * A rule-based, fully explainable priority score for the selection
 * committee — inspired by the same shape of reasoning as a dropout-risk
 * model (structured contributions, transparent weights), but framed as
 * admission-time *deservingness*, not post-enrollment risk, and computed
 * from data this app already collects rather than a separately-trained
 * model. It never recommends rejection — only "review more closely" — and
 * it runs once, at selection time, not continuously on enrolled students.
 *
 * The weights deliberately mirror Maatram's own stated priorities (orphans,
 * single-parent households, girls — see the foundation's published
 * beneficiary mix): these are protective factors that raise priority, the
 * same way they do in practice today.
 */
export function computeDeservingness(input: ScoreInput): DeservingnessResult {
  let score = 50;
  const reasons: DeservingnessReason[] = [];

  const add = (factor: string, weight: number) => {
    score += weight;
    reasons.push({ factor, weight });
  };

  if (input.boardPercentage != null) {
    if (input.boardPercentage >= 90) add("Strong academic record (90%+)", 15);
    else if (input.boardPercentage >= 75) add("Good academic record (75–89%)", 8);
  }

  switch (input.familySituation) {
    case "ORPHAN":
      add("Orphan — Maatram priority category", 25);
      break;
    case "SINGLE_PARENT":
      add("Single-parent household — Maatram priority category", 20);
      break;
    case "GUARDIAN_CARE":
      add("Guardian care — priority consideration", 12);
      break;
    default:
      break;
  }

  if (input.gender === "FEMALE") {
    add("Girl child — Maatram priority category", 8);
  }

  if (input.annualIncomeInr != null && input.householdSize) {
    const perMember = input.annualIncomeInr / input.householdSize;
    if (perMember < 15000) add("Very high financial need (<₹15,000/member/yr)", 15);
    else if (perMember < 30000) add("High financial need (<₹30,000/member/yr)", 8);
  }

  if (input.interviewScores.length > 0) {
    const avg = (key: keyof ScoreInput["interviewScores"][number]) =>
      input.interviewScores.reduce((s, x) => s + x[key], 0) / input.interviewScores.length;

    const financialNeed = avg("financialNeed");
    const intentClarity = avg("intentClarity");
    const communication = avg("communication");

    if (financialNeed >= 8) add("Panel assessed high financial need", 10);
    if (intentClarity >= 8) add("Clear intent and motivation (panel)", 5);
    else if (intentClarity < 4) add("Panel noted unclear intent — worth a closer conversation", -5);
    if (communication < 4) add("Panel noted communication gaps — may need extra onboarding support", -3);
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  const tier: DeservingnessResult["tier"] =
    score >= 70 ? "HIGH_PRIORITY" : score < 35 ? "REVIEW_RECOMMENDED" : "STANDARD";

  return { score, tier, reasons };
}
