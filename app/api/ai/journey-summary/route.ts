import { NextResponse, NextRequest } from "next/server";
import { auth } from "@/auth";
import { getPersonTimeline, describePersonTimelineEvent } from "@/lib/person-timeline";
import { askGemini } from "@/lib/gemini";

/** Narrates one person's merged event history in plain English — the
 * same events the Full Timeline card already lists, just read aloud
 * instead of itemized. Built fresh from the live event log every
 * request, same as the alumni Q&A and advisory-summary routes. */
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

  const events = await getPersonTimeline(applicantId);
  if (events.length === 0) {
    return NextResponse.json({ ok: false, error: "No recorded events yet" }, { status: 400 });
  }

  const narrative = events.map((e) => ({
    when: e.occurredAt.toISOString().slice(0, 10),
    what: describePersonTimelineEvent(e.type, (e.payload ?? {}) as Record<string, unknown>),
  }));

  const prompt = `Narrate this person's journey through a scholarship/mentorship program in plain, warm, factual English — 4-6 sentences, chronological, no markdown, no speculation beyond what's listed. Use only the events below.

Events (JSON, chronological):
${JSON.stringify(narrative)}

Write the narrative now.`;

  const result = await askGemini(prompt);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 503 });
  }
  return NextResponse.json({ ok: true, narrative: result.text });
}
