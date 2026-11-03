import { NextResponse, NextRequest } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { askGemini } from "@/lib/gemini";

const MAX_QUESTION_LENGTH = 300;

/** Answers a free-text question against the real alumni/career data — not
 * a chatbot with open-ended access, a single bounded prompt built fresh
 * per request from exactly what's in the directory right now, so the
 * model can't answer from anything else. */
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user || session.user.role !== "STAFF") {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const question = typeof body?.question === "string" ? body.question.trim() : "";
  if (!question) {
    return NextResponse.json({ ok: false, error: "Ask a question first" }, { status: 400 });
  }
  if (question.length > MAX_QUESTION_LENGTH) {
    return NextResponse.json({ ok: false, error: `Keep it under ${MAX_QUESTION_LENGTH} characters` }, { status: 400 });
  }

  const alumni = await prisma.alumniProfile.findMany({
    include: {
      student: { include: { user: true, college: true } },
      careerEvents: { orderBy: { startDate: "asc" } },
    },
  });

  const directory = alumni.map((a) => ({
    name: a.student.user.name,
    college: a.student.college.name,
    currentRole: a.currentRole,
    currentCompany: a.currentCompany,
    careerHistory: a.careerEvents.map((e) => ({
      company: e.company,
      role: e.role,
      source: e.source,
      startDate: e.startDate.toISOString().slice(0, 10),
      endDate: e.endDate?.toISOString().slice(0, 10) ?? "present",
    })),
  }));

  const prompt = `You answer questions about a nonprofit's alumni directory using ONLY the JSON data below — never outside knowledge, never a guess. If the data doesn't answer the question, say so plainly instead of inventing an answer. Be concise (2-4 sentences, no markdown headers).

Alumni directory (JSON):
${JSON.stringify(directory)}

Question: ${question}`;

  const result = await askGemini(prompt);
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 503 });
  }
  return NextResponse.json({ ok: true, answer: result.text });
}
