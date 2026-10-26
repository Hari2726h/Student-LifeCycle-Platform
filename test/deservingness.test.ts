import { describe, it, expect } from "vitest";
import { computeDeservingness } from "@/lib/deservingness";

const baseInput = {
  boardPercentage: null as number | null,
  gender: "MALE" as const,
  familySituation: null,
  annualIncomeInr: null as number | null,
  householdSize: null as number | null,
  interviewScores: [] as { financialNeed: number; intentClarity: number; communication: number }[],
};

describe("computeDeservingness", () => {
  it("starts at a neutral 50/STANDARD with no contributing factors", () => {
    const result = computeDeservingness(baseInput);
    expect(result.score).toBe(50);
    expect(result.tier).toBe("STANDARD");
    expect(result.reasons).toEqual([]);
  });

  it("stacks every priority factor up to HIGH_PRIORITY, capped at 100", () => {
    const result = computeDeservingness({
      ...baseInput,
      boardPercentage: 95,
      gender: "FEMALE",
      familySituation: "ORPHAN",
      annualIncomeInr: 60000,
      householdSize: 5, // 12,000/member/yr -> very high need
    });
    expect(result.tier).toBe("HIGH_PRIORITY");
    expect(result.score).toBe(100); // 50+15+25+8+15 = 113, clamped to 100
    expect(result.reasons.map((r) => r.factor)).toEqual([
      "Strong academic record (90%+)",
      "Orphan — Maatram priority category",
      "Girl child — Maatram priority category",
      "Very high financial need (<₹15,000/member/yr)",
      // Positive-only bias is deliberate: an admission-time score should
      // never recommend rejection, only flag for closer review.
    ]);
  });

  it("never recommends rejection — negative panel signals pull the score down but not below a floor", () => {
    const result = computeDeservingness({
      ...baseInput,
      interviewScores: [{ financialNeed: 2, intentClarity: 2, communication: 2 }],
    });
    expect(result.score).toBe(42); // 50 - 5 (unclear intent) - 3 (comm gap)
    // The only negative weights are -5 and -3, so the floor from a neutral
    // base is 42 — REVIEW_RECOMMENDED's <35 threshold is unreachable from
    // interview-panel signals alone, by design (it's advisory, never punitive).
    expect(result.tier).toBe("STANDARD");
  });

  it("only counts the family-situation bonus once, taking the matched category", () => {
    const orphan = computeDeservingness({ ...baseInput, familySituation: "ORPHAN" });
    const singleParent = computeDeservingness({ ...baseInput, familySituation: "SINGLE_PARENT" });
    const guardianCare = computeDeservingness({ ...baseInput, familySituation: "GUARDIAN_CARE" });
    expect(orphan.score).toBe(75);
    expect(singleParent.score).toBe(70);
    expect(guardianCare.score).toBe(62);
  });

  it("averages interview scores across multiple panelists before applying thresholds", () => {
    const result = computeDeservingness({
      ...baseInput,
      interviewScores: [
        { financialNeed: 9, intentClarity: 9, communication: 9 },
        { financialNeed: 7, intentClarity: 7, communication: 7 }, // avg 8 — right at the threshold
      ],
    });
    expect(result.reasons.map((r) => r.factor)).toContain("Panel assessed high financial need");
    expect(result.reasons.map((r) => r.factor)).toContain("Clear intent and motivation (panel)");
  });

  it("ignores missing optional inputs instead of treating them as zero", () => {
    const withNulls = computeDeservingness(baseInput);
    const withZeroIncome = computeDeservingness({ ...baseInput, annualIncomeInr: 0, householdSize: 0 });
    // householdSize: 0 would divide-by-zero if not guarded — must not add a
    // phantom "very high need" factor from falsy-but-present zero values.
    expect(withZeroIncome.reasons).toEqual(withNulls.reasons);
  });
});
