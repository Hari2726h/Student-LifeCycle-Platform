import { NextResponse, NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { askGemini } from "@/lib/gemini";
import { computeDeservingness } from "@/lib/deservingness";

/** A synthesis of what the committee has already recorded — scores,
 * panelist notes, the deservingness factors — not a new judgment. The
 * prompt explicitly forbids a recommendation; this exists to save a
 * panelist re-reading four scorecards before a meeting, nothing more. */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || !["STAFF", "COMMITTEE"].includes(session.user.role)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const applicantId = typeof body?.applicantId === "string" ? body.applicantId : "";
  if (!applicantId) {
    return NextResponse.json({ ok: false, error: "Missing applicantId" }, { status: 400 });
  }

  const applicant = await prisma.applicant.findUnique({
    where: { id: applicantId },
    include: {
      sensitiveInfo: true,
      verification: true,
      interview: { include: { scores: { include: { panelist: true } } } },
    },
  });
  if (!applicant?.interview || applicant.interview.scores.length === 0) {
    return NextResponse.json({ ok: false, error: "No interview scores recorded yet" }, { status: 400 });
  }

  const deservingness = computeDeservingness({
    boardPercentage: applicant.boardPercentage,
    gender: applicant.gender,
    familySituation: applicant.sensitiveInfo?.familySituation ?? null,
    annualIncomeInr: applicant.sensitiveInfo?.annualIncomeInr ?? null,
    householdSize: applicant.sensitiveInfo?.householdSize ?? null,
    interviewScores: applicant.interview.scores,
  });

  const context = {
    applicant: { district: applicant.district, courseInterest: applicant.courseInterest, boardPercentage: applicant.boardPercentage },
    verificationNotes: applicant.verification?.notes ?? null,
    scorecards: applicant.interview.scores.map((s) => ({
      panelist: s.panelist.name,
      academicMerit: s.academicMerit,
      financialNeed: s.financialNeed,
      communication: s.communication,
      intentClarity: s.intentClarity,
      notes: s.notes,
    })),
    deservingnessTier: deservingness.tier,
    deservingnessFactors: deservingness.reasons.map((r) => r.factor),
  };

  const prompt = `You write short, neutral briefing notes for a scholarship selection committee, synthesizing what panelists have ALREADY recorded. You are NOT deciding anything and must NOT recommend accept/reject/waitlist — only summarize patterns, agreements, and disagreements across the scorecards and notes below. 3-5 sentences, plain prose, no markdown.

Data (JSON):
${JSON.stringify(context)}

Write the briefing note now.`;

  const result = await askGemini(prompt);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 503 });
  }
  return NextResponse.json({ ok: true, summary: result.text });
}
